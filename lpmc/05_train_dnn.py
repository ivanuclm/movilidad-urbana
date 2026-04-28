#!/usr/bin/env python
#
# El modelo Keras se guarda en models/dnn_lpmc.keras.
# El bundle joblib solo contiene la ruta al .keras y los feature_names;
# el backend crea el wrapper en tiempo de carga (KerasModalWrapper en lpmc_inference.py).

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
    """GMPCA = exp( -cross entropy )."""
    proba = np.clip(proba, 1e-12, 1.0)
    log_like = np.log(proba[np.arange(len(y_true)), y_true]).sum()
    return float(np.exp(log_like / len(y_true)))


def scale(X_tr: pd.DataFrame, X_val: pd.DataFrame, cols: list[str]):
    sc = StandardScaler()
    Xts = X_tr.copy()
    Xvs = X_val.copy()
    Xts[cols] = sc.fit_transform(X_tr[cols].astype(float))
    Xvs[cols] = sc.transform(X_val[cols].astype(float))
    return Xts, Xvs, sc


def build_model(n_features: int):
    import tensorflow as tf

    inputs = tf.keras.Input(shape=(n_features,))
    x = tf.keras.layers.BatchNormalization()(inputs)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    x = tf.keras.layers.Dense(32, activation="relu")(x)
    outputs = tf.keras.layers.Dense(4, activation="softmax")(x)

    model = tf.keras.Model(inputs, outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


RANDOM_STATE = 481516


def main() -> None:
    import tensorflow as tf

    tf.random.set_seed(RANDOM_STATE)
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

    def make_callbacks():
        return [
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss", patience=10, restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss", factor=0.5, patience=5, min_lr=1e-5
            ),
        ]

    # --- 5-fold GroupKFold CV (métricas de entrenamiento) ---
    cv_accs: list[float] = []
    cv_gmpcas: list[float] = []

    if groups is not None:
        print(f"\n{N_CV_FOLDS}-fold GroupKFold CV (household_id como grupo)...")
        gkf = GroupKFold(n_splits=N_CV_FOLDS)
        for fold, (tr_idx, val_idx) in enumerate(
            gkf.split(X_train, y_train, groups), start=1
        ):
            print(f"  Fold {fold}/{N_CV_FOLDS}...")
            Xf_tr = X_train.iloc[tr_idx]
            Xf_val = X_train.iloc[val_idx]
            yf_tr = y_train[tr_idx]
            yf_val = y_train[val_idx]

            Xf_tr_s, Xf_val_s, _ = scale(Xf_tr, Xf_val, scaled_features)
            Xf_tr_arr = Xf_tr_s.values.astype(np.float32)
            Xf_val_arr = Xf_val_s.values.astype(np.float32)

            model_fold = build_model(n_features)
            model_fold.fit(
                Xf_tr_arr, yf_tr,
                validation_data=(Xf_val_arr, yf_val),
                epochs=epochs,
                batch_size=batch_size,
                callbacks=make_callbacks(),
                verbose=0,
            )

            proba_val = model_fold.predict(Xf_val_arr, verbose=0)
            y_val_pred = np.argmax(proba_val, axis=1)
            fold_acc = accuracy_score(yf_val, y_val_pred)
            fold_gmpca = gmpca_from_proba(proba_val, yf_val)
            cv_accs.append(fold_acc)
            cv_gmpcas.append(fold_gmpca)
            print(f"    acc={fold_acc:.4f}  gmpca={fold_gmpca:.4f}")
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

    model = build_model(n_features)
    model.summary()
    history = model.fit(
        X_train_arr, y_train,
        validation_split=0.1,
        epochs=epochs,
        batch_size=batch_size,
        callbacks=make_callbacks(),
        verbose=1,
    )

    proba_test = model.predict(X_test_arr, verbose=0)
    y_test_pred = np.argmax(proba_test, axis=1)
    acc_test = accuracy_score(y_test, y_test_pred)
    gmpca_test = gmpca_from_proba(proba_test, y_test)

    print(f"Test      -> Accuracy: {acc_test*100:.2f}%  GMPCA: {gmpca_test*100:.2f}%")
    print("\nClassification report (test):")
    print(classification_report(y_test, y_test_pred, target_names=["walk", "cycle", "pt", "drive"]))

    keras_path = MODELS_DIR / "dnn_lpmc.keras"
    bundle_path = MODELS_DIR / "dnn_lpmc.joblib"
    scaler_path = MODELS_DIR / "dnn_lpmc_scaler.joblib"

    model.save(str(keras_path))
    joblib.dump({"keras_path": str(keras_path), "feature_names": feature_names}, bundle_path)
    joblib.dump({"scaler": scaler, "scaled_features": scaled_features}, scaler_path)

    metrics_path = ARTIFACTS_DIR / "dnn_lpmc_metrics.json"
    metrics_payload = {
        "train_cv": {"accuracy": acc_cv, "gmpca": gmpca_cv},
        "test": {"accuracy": acc_test, "gmpca": gmpca_test},
        "architecture": "Input→BN→Dense(128,relu)→Drop(0.3)→Dense(64,relu)→Drop(0.2)→Dense(32,relu)→Dense(4,softmax)",
        "epochs_trained": len(history.history["loss"]),
        "epochs_max": epochs,
        "batch_size": batch_size,
        "cv_folds": N_CV_FOLDS,
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2))

    print(f"\nModelo Keras guardado en : {keras_path}")
    print(f"Bundle joblib guardado en: {bundle_path}")
    print(f"Scaler guardado en       : {scaler_path}")
    print(f"Métricas guardadas en    : {metrics_path}")


if __name__ == "__main__":
    main()
