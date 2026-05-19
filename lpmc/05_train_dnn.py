#!/usr/bin/env python
"""
Entrenamiento de la red neuronal profunda (DNN) para clasificación modal (LPMC).

Entrada : data/preprocessed/LPMC_train.csv
          data/preprocessed/LPMC_test.csv

Salida  : models/dnn_lpmc.pt            — state_dict PyTorch + n_features
          models/dnn_lpmc.joblib        — bundle con ruta al .pt y feature_names
          models/dnn_lpmc_scaler.joblib — StandardScaler + columnas escaladas
          artifacts/dnn_lpmc_metrics.json — métricas CV y test

Arquitectura: Linear(n→128)→BN→ReLU→Drop(0.3) → Linear(128→64)→BN→ReLU→Drop(0.2)
              → Linear(64→32)→BN→ReLU → Linear(32→4)
El BatchNorm se coloca DESPUÉS de cada Linear y ANTES de la activación. Esto
normaliza las preactivaciones, evitando que el gradiente explote o desaparezca
en capas profundas y haciendo que la función de pérdida sea más suave.

El modelo se guarda en dos formatos:
  - .pt (state_dict): lo carga TorchModalWrapper en lpmc_inference.py.
  - .joblib (bundle): lo carga joblib.load() en el backend; contiene la ruta al
    .pt y los feature_names, pero NO el estado del modelo para evitar duplicar
    el artefacto pesado.

Variables de entorno:
  DNN_EPOCHS     — número máximo de épocas (por defecto 100)
  DNN_BATCH_SIZE — tamaño de mini-batch (por defecto 512)

Uso:
    python 05_train_dnn.py
"""

import json
import os
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data" / "preprocessed"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

N_CV_FOLDS = 5
# Semilla compartida con XGBoost y RF para reproducibilidad entre experimentos.
RANDOM_STATE = 481516

# Misma lista que XGBoost y RF. La DNN SÍ es sensible al escalado (a diferencia
# de los árboles), por lo que el escalado aquí es funcionalmente necesario, no
# solo por consistencia con el pipeline.
SCALED_FEATURES = [
    "day_of_week",
    "start_time_linear",
    "age",
    "car_ownership",
    "distance",
    "dur_walking",
    "dur_cycling",
    "dur_pt_access",
    "dur_pt_rail",
    "dur_pt_bus",
    "dur_pt_int_waiting",
    "dur_pt_int_walking",
    "pt_n_interchanges",
    "dur_driving",
    "cost_transit",
    "cost_driving_total",
]


def gmpca_from_proba(proba: np.ndarray, y_true: np.ndarray) -> float:
    """GMPCA = exp( -cross entropy ).

    Geometric Mean Probability of Correct Alternative. Métrica complementaria
    a accuracy que evalúa la calibración del modelo: penaliza predicciones
    confiadas y erróneas más que accuracy pura.
    """
    proba = np.clip(proba, 1e-12, 1.0)
    log_like = np.log(proba[np.arange(len(y_true)), y_true]).sum()
    return float(np.exp(log_like / len(y_true)))


def scale(X_tr: pd.DataFrame, X_val: pd.DataFrame, cols: list[str]):
    """Ajusta StandardScaler solo en X_tr y aplica la misma transformación a X_val."""
    sc = StandardScaler()
    Xts = X_tr.copy()
    Xvs = X_val.copy()
    Xts[cols] = sc.fit_transform(X_tr[cols].astype(float))
    Xvs[cols] = sc.transform(X_val[cols].astype(float))
    return Xts, Xvs, sc


def build_model(n_features: int):
    """Construye la arquitectura de la red neuronal.

    Orden de capas por bloque: Linear → BatchNorm → ReLU → (Dropout opcional).
    BatchNorm DESPUÉS de Linear normaliza las preactivaciones antes de aplicar
    ReLU. Colocarlo antes de Linear es equivalente a normalizar las activaciones
    de la capa anterior, lo cual resulta en magnitudes arbitrariamente grandes de
    los parámetros gamma de BN conforme avanza el entrenamiento.

    No se aplica Dropout en el último bloque oculto (64→32) para evitar demasiada
    regularización en la representación final antes de la capa de salida.
    """
    import torch.nn as nn
    return nn.Sequential(
        nn.Linear(n_features, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.3),
        nn.Linear(128, 64),         nn.BatchNorm1d(64),  nn.ReLU(), nn.Dropout(0.2),
        nn.Linear(64, 32),          nn.BatchNorm1d(32),  nn.ReLU(),
        nn.Linear(32, 4),
        # Sin softmax final: CrossEntropyLoss espera logits (los combina internamente
        # con LogSoftmax para mayor estabilidad numérica). En inferencia se aplica
        # softmax explícito para obtener probabilidades.
    )


def predict_proba_torch(model, X_arr: np.ndarray) -> np.ndarray:
    """Devuelve probabilidades softmax para cada clase (shape: N×4).

    Pone el modelo en modo eval() para desactivar Dropout y el comportamiento
    de entrenamiento de BatchNorm (que usa estadísticas del batch en lugar
    de las medias/varianzas acumuladas).
    """
    import torch
    import torch.nn.functional as F
    model.eval()
    with torch.no_grad():
        logits = model(torch.tensor(X_arr, dtype=torch.float32))
        return F.softmax(logits, dim=1).numpy()


def train_model(model, X_tr: np.ndarray, y_tr: np.ndarray,
                X_val: np.ndarray, y_val: np.ndarray,
                epochs: int, batch_size: int) -> int:
    """Entrena el modelo con early stopping y devuelve el número de épocas ejecutadas.

    Decisiones de diseño:
    - Adam lr=1e-3, weight_decay=1e-3: regularización L2 implícita vía AdamW-style.
    - label_smoothing=0.1: evita que el modelo maximice logits indefinidamente;
      con smoothing el óptimo teórico es un logit finito, lo que mejora la
      calibración de las probabilidades.
    - clip_grad_norm_ max_norm=1.0: evita explosión de gradientes en los primeros
      mini-batches cuando los parámetros todavía no están ajustados.
    - ReduceLROnPlateau factor=0.5 patience=5: reduce lr a la mitad si la pérdida
      de validación no mejora en 5 épocas consecutivas.
    - Early stopping patience=10: restaura el mejor estado y para el entrenamiento
      si la pérdida de validación no mejora en 10 épocas.
    """
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-3)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, factor=0.5, patience=5, min_lr=1e-5
    )
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    X_tr_t = torch.tensor(X_tr, dtype=torch.float32)
    y_tr_t = torch.tensor(y_tr, dtype=torch.long)
    X_val_t = torch.tensor(X_val, dtype=torch.float32)
    y_val_t = torch.tensor(y_val, dtype=torch.long)

    loader = DataLoader(TensorDataset(X_tr_t, y_tr_t), batch_size=batch_size, shuffle=True)

    best_val_loss = float("inf")
    patience_counter = 0
    patience = 10
    best_state = None
    epochs_run = 0

    for epoch in range(1, epochs + 1):
        model.train()
        for Xb, yb in loader:
            optimizer.zero_grad()
            criterion(model(Xb), yb).backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_loss = criterion(model(X_val_t), y_val_t).item()

        scheduler.step(val_loss)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            # Copia profunda del estado para poder restaurarlo si el modelo empeora.
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1

        epochs_run = epoch
        if patience_counter >= patience:
            break

    if best_state is not None:
        model.load_state_dict(best_state)

    return epochs_run


def main() -> None:
    import torch

    torch.manual_seed(RANDOM_STATE)
    np.random.seed(RANDOM_STATE)

    train_path = DATA_DIR / "LPMC_train.csv"
    test_path = DATA_DIR / "LPMC_test.csv"

    print(f"Leyendo train de: {train_path}")
    print(f"Leyendo test  de: {test_path}")

    train = pd.read_csv(train_path)
    test = pd.read_csv(test_path)

    target_col = "travel_mode"
    y_train = train[target_col].astype(int).values
    y_test = test[target_col].astype(int).values

    # household_id: solo para GroupKFold, nunca entra como feature.
    groups = train["household_id"].values if "household_id" in train.columns else None

    X_train = train.drop(columns=[target_col, "household_id"], errors="ignore")
    X_test = test.drop(columns=[target_col, "household_id"], errors="ignore")

    # Garantizar columnas simétricas entre train y test.
    for c in set(X_train.columns) - set(X_test.columns):
        X_test[c] = 0
    for c in set(X_test.columns) - set(X_train.columns):
        X_train[c] = 0
    X_test = X_test[X_train.columns]

    scaled_features = [c for c in SCALED_FEATURES if c in X_train.columns]
    feature_names = X_train.columns.tolist()
    n_features = len(feature_names)
    print(f"\nFeatures totales: {n_features}, a escalar: {len(scaled_features)}")

    epochs = int(os.environ.get("DNN_EPOCHS", "100"))
    batch_size = int(os.environ.get("DNN_BATCH_SIZE", "512"))

    # --- 5-fold GroupKFold CV ---
    cv_accs: list[float] = []
    cv_gmpcas: list[float] = []

    if groups is not None:
        print(f"\n{N_CV_FOLDS}-fold GroupKFold CV (household_id como grupo)...")
        gkf = GroupKFold(n_splits=N_CV_FOLDS)
        for fold, (tr_idx, val_idx) in enumerate(
            gkf.split(X_train, y_train, groups), start=1
        ):
            print(f"  Fold {fold}/{N_CV_FOLDS}...", end=" ", flush=True)
            Xf_tr = X_train.iloc[tr_idx]
            Xf_val = X_train.iloc[val_idx]
            yf_tr = y_train[tr_idx]
            yf_val = y_train[val_idx]

            Xf_tr_s, Xf_val_s, _ = scale(Xf_tr, Xf_val, scaled_features)

            model_fold = build_model(n_features)
            # En CV, el fold de validación también actúa como conjunto de early stopping.
            # Esto es aceptable porque no se buscan hiperparámetros durante el CV;
            # solo se estiman métricas de generalización.
            train_model(
                model_fold,
                Xf_tr_s.values.astype(np.float32), yf_tr,
                Xf_val_s.values.astype(np.float32), yf_val,
                epochs, batch_size,
            )

            proba_val = predict_proba_torch(model_fold, Xf_val_s.values.astype(np.float32))
            y_val_pred = np.argmax(proba_val, axis=1)
            fold_acc = accuracy_score(yf_val, y_val_pred)
            fold_gmpca = gmpca_from_proba(proba_val, yf_val)
            cv_accs.append(fold_acc)
            cv_gmpcas.append(fold_gmpca)
            print(f"acc={fold_acc:.4f}  gmpca={fold_gmpca:.4f}")
    else:
        print("\n[AVISO] household_id no encontrado; se omite el CV.")

    acc_cv = float(np.mean(cv_accs)) if cv_accs else None
    gmpca_cv = float(np.mean(cv_gmpcas)) if cv_gmpcas else None

    if acc_cv is not None:
        print(f"\nCV medio  -> Accuracy: {acc_cv*100:.2f}%  GMPCA: {gmpca_cv*100:.2f}%")

    # --- Modelo final sobre todo el conjunto de entrenamiento ---
    print(f"\nEntrenando modelo final (max_epochs={epochs}, batch_size={batch_size})...")
    X_train_s, X_test_s, scaler = scale(X_train, X_test, scaled_features)
    X_train_arr = X_train_s.values.astype(np.float32)
    X_test_arr = X_test_s.values.astype(np.float32)

    # El modelo final se entrena con todo el train, pero necesita un conjunto de
    # validación para el early stopping. Se reserva el último 10% del train (en
    # orden de filas, no aleatorio) para no introducir sesgo de selección.
    n_val = max(1, int(len(X_train_arr) * 0.1))
    X_final_tr, X_final_val = X_train_arr[:-n_val], X_train_arr[-n_val:]
    y_final_tr, y_final_val = y_train[:-n_val], y_train[-n_val:]

    model = build_model(n_features)
    epochs_run = train_model(
        model, X_final_tr, y_final_tr, X_final_val, y_final_val, epochs, batch_size
    )
    print(f"Épocas entrenadas: {epochs_run}")

    proba_test = predict_proba_torch(model, X_test_arr)
    y_test_pred = np.argmax(proba_test, axis=1)
    acc_test = accuracy_score(y_test, y_test_pred)
    gmpca_test = gmpca_from_proba(proba_test, y_test)

    print(f"Test      -> Accuracy: {acc_test*100:.2f}%  GMPCA: {gmpca_test*100:.2f}%")
    print("\nClassification report (test):")
    print(classification_report(y_test, y_test_pred, target_names=["walk", "cycle", "pt", "drive"]))

    import torch
    pt_path = MODELS_DIR / "dnn_lpmc.pt"
    bundle_path = MODELS_DIR / "dnn_lpmc.joblib"
    scaler_path = MODELS_DIR / "dnn_lpmc_scaler.joblib"

    # .pt: solo state_dict y n_features. El backend reconstruye la arquitectura
    # en TorchModalWrapper._ensure_loaded() a partir de n_features.
    torch.save({"state_dict": model.state_dict(), "n_features": n_features}, str(pt_path))
    # .joblib: bundle ligero con la ruta al .pt. No duplica los pesos.
    joblib.dump({"pt_path": str(pt_path), "n_features": n_features, "feature_names": feature_names}, bundle_path)
    joblib.dump({"scaler": scaler, "scaled_features": scaled_features}, scaler_path)

    metrics_path = ARTIFACTS_DIR / "dnn_lpmc_metrics.json"
    metrics_payload = {
        "train_cv": {"accuracy": acc_cv, "gmpca": gmpca_cv},
        "test": {"accuracy": acc_test, "gmpca": gmpca_test},
        "architecture": "Linear(n→128)→BN→ReLU→Drop(0.3)→Linear(128→64)→BN→ReLU→Drop(0.2)→Linear(64→32)→BN→ReLU→Linear(32→4)",
        "epochs_trained": epochs_run,
        "epochs_max": epochs,
        "batch_size": batch_size,
        "cv_folds": N_CV_FOLDS,
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2))

    print(f"\nModelo PyTorch guardado en : {pt_path}")
    print(f"Bundle joblib guardado en  : {bundle_path}")
    print(f"Scaler guardado en         : {scaler_path}")
    print(f"Métricas guardadas en      : {metrics_path}")


if __name__ == "__main__":
    main()
