#!/usr/bin/env python
"""
Entrenamiento del modelo Random Forest para clasificación de modo de transporte (LPMC).

Entrada : data/preprocessed/LPMC_train.csv
          data/preprocessed/LPMC_test.csv
          artifacts/lpmc_rf_best_params.json  (opcional; si existe sobreescribe DEFAULT_PARAMS)

Salida  : models/rf_lpmc.joblib         — modelo RandomForest + lista de features
          models/rf_lpmc_scaler.joblib  — StandardScaler + lista de columnas escaladas
          artifacts/rf_lpmc_metrics.json — métricas CV y test (accuracy, GMPCA)

El flujo de entrenamiento es idéntico al de XGBoost (03_train_xgb.py):
GroupKFold(5) por household_id, scaler ajustado solo en fold de train, modelo
final entrenado sobre todo el train set. Esto permite comparar ambos modelos
con la misma metodología de validación.

Variables de entorno:
  FAST_N_ESTIMATORS — sobreescribe n_estimators para pruebas rápidas

Uso:
    python 04_train_rf.py
"""

import json
import os
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data" / "preprocessed"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

N_CV_FOLDS = 5

# Misma lista de columnas escaladas que XGBoost para mantener consistencia
# en el pipeline de inferencia. Los Random Forests son también invariantes al
# escalado, pero el escalado parcial se aplica igualmente para que el backend
# use exactamente el mismo código de preprocesado con los tres modelos.
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

# Hiperparámetros por defecto seleccionados manualmente.
# max_depth=None permite que los árboles crezcan hasta hojas puras, lo cual
# favorece la capacidad del ensemble pero puede provocar sobreajuste en datos
# pequeños. min_samples_split y min_samples_leaf actúan como regularización.
# max_features='sqrt' es el estándar de Breiman para clasificación.
DEFAULT_PARAMS: dict = {
    "n_estimators": 500,
    "max_depth": None,
    "min_samples_split": 5,
    "min_samples_leaf": 2,
    "max_features": "sqrt",
    "n_jobs": -1,
    "random_state": 481516,
}


def load_best_params() -> dict:
    """Carga hiperparámetros desde JSON si existe; si no, usa DEFAULT_PARAMS."""
    params_path = ARTIFACTS_DIR / "lpmc_rf_best_params.json"
    if not params_path.exists():
        return DEFAULT_PARAMS
    with params_path.open() as f:
        bundle = json.load(f)
    return bundle.get("params", DEFAULT_PARAMS)


def gmpca_from_proba(proba: np.ndarray, y_true: np.ndarray) -> float:
    """GMPCA = exp( -cross entropy ).

    Geometric Mean Probability of Correct Alternative. Equivalente a exp(-H)
    donde H es la entropía cruzada. Permite comparar calibración entre modelos
    más allá de la accuracy, penalizando predicciones muy incorrectas.
    """
    proba = np.clip(proba, 1e-12, 1.0)
    log_like = np.log(proba[np.arange(len(y_true)), y_true]).sum()
    return float(np.exp(log_like / len(y_true)))


def scale(X_tr: pd.DataFrame, X_val: pd.DataFrame, cols: list[str]):
    """Ajusta StandardScaler en X_tr y transforma ambos conjuntos.

    El scaler se ajusta SOLO sobre el fold de train para evitar fuga de
    información de validación hacia el proceso de normalización.
    """
    sc = StandardScaler()
    Xts = X_tr.copy()
    Xvs = X_val.copy()
    Xts[cols] = sc.fit_transform(X_tr[cols].astype(float))
    Xvs[cols] = sc.transform(X_val[cols].astype(float))
    return Xts, Xvs, sc


def main() -> None:
    train_path = DATA_DIR / "LPMC_train.csv"
    test_path = DATA_DIR / "LPMC_test.csv"

    print(f"Leyendo train de: {train_path}")
    print(f"Leyendo test  de: {test_path}")

    train = pd.read_csv(train_path)
    test = pd.read_csv(test_path)

    target_col = "travel_mode"
    y_train = train[target_col].astype(int).values
    y_test = test[target_col].astype(int).values

    # household_id: solo para agrupar en GroupKFold, nunca como feature.
    groups = train["household_id"].values if "household_id" in train.columns else None

    X_train = train.drop(columns=[target_col, "household_id"], errors="ignore")
    X_test = test.drop(columns=[target_col, "household_id"], errors="ignore")

    # Sincronizar columnas: el one-hot puede generar columnas distintas si alguna
    # categoría no aparece en el test set (e.g., un tipo de combustible raro).
    for c in set(X_train.columns) - set(X_test.columns):
        X_test[c] = 0
    for c in set(X_test.columns) - set(X_train.columns):
        X_train[c] = 0
    X_test = X_test[X_train.columns]

    scaled_features = [c for c in SCALED_FEATURES if c in X_train.columns]
    print(f"\nColumnas a escalar ({len(scaled_features)}): {scaled_features}")

    model_params = load_best_params()
    print(f"\nParámetros RF: {model_params}")

    fast_override = os.environ.get("FAST_N_ESTIMATORS")
    if fast_override:
        model_params = dict(model_params)
        model_params["n_estimators"] = int(fast_override)
        print(f"FAST_N_ESTIMATORS activo -> n_estimators={model_params['n_estimators']}")

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

            clf_fold = RandomForestClassifier(**model_params)
            clf_fold.fit(Xf_tr_s, yf_tr)

            proba_val = clf_fold.predict_proba(Xf_val_s)
            y_val_pred = clf_fold.predict(Xf_val_s)
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
    print("\nEntrenando modelo final sobre todo el train set...")
    X_train_s, X_test_s, scaler = scale(X_train, X_test, scaled_features)

    clf = RandomForestClassifier(**model_params)
    clf.fit(X_train_s, y_train)

    proba_test = clf.predict_proba(X_test_s)
    y_test_pred = clf.predict(X_test_s)
    acc_test = accuracy_score(y_test, y_test_pred)
    gmpca_test = gmpca_from_proba(proba_test, y_test)

    print(f"Test      -> Accuracy: {acc_test*100:.2f}%  GMPCA: {gmpca_test*100:.2f}%")
    print("\nClassification report (test):")
    print(classification_report(y_test, y_test_pred, target_names=["walk", "cycle", "pt", "drive"]))

    model_path = MODELS_DIR / "rf_lpmc.joblib"
    scaler_path = MODELS_DIR / "rf_lpmc_scaler.joblib"
    joblib.dump({"model": clf, "feature_names": X_train_s.columns.tolist()}, model_path)
    joblib.dump({"scaler": scaler, "scaled_features": scaled_features}, scaler_path)

    # max_depth=None no es serializable directamente a JSON; se convierte a string.
    serializable_params = {k: (str(v) if v is None else v) for k, v in model_params.items()}
    metrics_path = ARTIFACTS_DIR / "rf_lpmc_metrics.json"
    metrics_payload = {
        "train_cv": {"accuracy": acc_cv, "gmpca": gmpca_cv},
        "test": {"accuracy": acc_test, "gmpca": gmpca_test},
        "model_params": serializable_params,
        "cv_folds": N_CV_FOLDS,
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2))

    print(f"\nModelo guardado en    : {model_path}")
    print(f"Scaler guardado en    : {scaler_path}")
    print(f"Métricas guardadas en : {metrics_path}")


if __name__ == "__main__":
    main()
