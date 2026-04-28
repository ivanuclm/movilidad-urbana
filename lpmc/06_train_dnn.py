#!/usr/bin/env python
#
# El modelo Keras se guarda en models/dnn_lpmc_nohh.keras.
# El bundle joblib solo contiene la ruta al .keras y los feature_names;
# el backend crea el wrapper en tiempo de carga (KerasModalWrapper en lpmc_inference.py).

import json
import os
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler

BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data" / "preprocessed"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

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


def main() -> None:
    import tensorflow as tf

    train_path = DATA_DIR / "LPMC_train.csv"
    test_path = DATA_DIR / "LPMC_test.csv"

    print(f"Leyendo train de: {train_path}")
    print(f"Leyendo test  de: {test_path}")

    train = pd.read_csv(train_path)
    test = pd.read_csv(test_path)

    target_col = "travel_mode"
    y_train = train[target_col].astype(int).values
    y_test = test[target_col].astype(int).values

    X_train = train.drop(columns=[target_col])
    X_test = test.drop(columns=[target_col])

    drop_household = os.environ.get("DROP_HOUSEHOLD", "1") == "1"
    if drop_household:
        X_train = X_train.drop(columns=["household_id"], errors="ignore")
        X_test = X_test.drop(columns=["household_id"], errors="ignore")

    for c in set(X_train.columns) - set(X_test.columns):
        X_test[c] = 0
    for c in set(X_test.columns) - set(X_train.columns):
        X_train[c] = 0
    X_test = X_test[X_train.columns]

    scaled_features = [c for c in SCALED_FEATURES if c in X_train.columns]
    feature_names = X_train.columns.tolist()
    print(f"\nFeatures totales: {len(feature_names)}, a escalar: {len(scaled_features)}")

    scaler = StandardScaler()
    X_train_scaled = X_train.copy()
    X_test_scaled = X_test.copy()
    X_train_scaled[scaled_features] = scaler.fit_transform(X_train[scaled_features].astype(float))
    X_test_scaled[scaled_features] = scaler.transform(X_test[scaled_features].astype(float))

    X_train_arr = X_train_scaled.values.astype(np.float32)
    X_test_arr = X_test_scaled.values.astype(np.float32)

    epochs = int(os.environ.get("DNN_EPOCHS", "100"))
    batch_size = int(os.environ.get("DNN_BATCH_SIZE", "512"))

    model = build_model(X_train_arr.shape[1])
    model.summary()

    early_stopping = tf.keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=10,
        restore_best_weights=True,
    )

    reduce_lr = tf.keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=5,
        min_lr=1e-5,
    )

    print(f"\nEntrenando DNN (max_epochs={epochs}, batch_size={batch_size})...")
    history = model.fit(
        X_train_arr,
        y_train,
        validation_split=0.1,
        epochs=epochs,
        batch_size=batch_size,
        callbacks=[early_stopping, reduce_lr],
        verbose=1,
    )

    proba_train = model.predict(X_train_arr, verbose=0)
    proba_test = model.predict(X_test_arr, verbose=0)
    y_train_pred = np.argmax(proba_train, axis=1)
    y_test_pred = np.argmax(proba_test, axis=1)

    acc_train = accuracy_score(y_train, y_train_pred)
    acc_test = accuracy_score(y_test, y_test_pred)
    gmpca_train = gmpca_from_proba(proba_train, y_train)
    gmpca_test = gmpca_from_proba(proba_test, y_test)

    print(f"\nAccuracy train: {acc_train:.4f} ({acc_train*100:.2f}%)")
    print(f"Accuracy test : {acc_test:.4f} ({acc_test*100:.2f}%)")
    print(f"GMPCA train   : {gmpca_train:.4f} ({gmpca_train*100:.2f}%)")
    print(f"GMPCA test    : {gmpca_test:.4f} ({gmpca_test*100:.2f}%)")

    print("\nClassification report (test):")
    print(
        classification_report(
            y_test,
            y_test_pred,
            target_names=["walk", "cycle", "pt", "drive"],
        )
    )

    suffix = "_nohh" if drop_household else ""
    keras_path = MODELS_DIR / f"dnn_lpmc{suffix}.keras"
    bundle_path = MODELS_DIR / f"dnn_lpmc{suffix}.joblib"
    scaler_path = MODELS_DIR / f"dnn_lpmc_scaler{suffix}.joblib"

    model.save(str(keras_path))
    # El bundle no serializa el modelo Keras directamente: solo guarda la ruta.
    # lpmc_inference.py crea el KerasModalWrapper al cargar este bundle.
    joblib.dump(
        {"keras_path": str(keras_path), "feature_names": feature_names},
        bundle_path,
    )
    joblib.dump({"scaler": scaler, "scaled_features": scaled_features}, scaler_path)

    metrics_path = ARTIFACTS_DIR / f"dnn_lpmc_metrics{suffix}.json"
    metrics_payload = {
        "train": {"accuracy": acc_train, "gmpca": gmpca_train},
        "test": {"accuracy": acc_test, "gmpca": gmpca_test},
        "architecture": "Input→BN→Dense(128,relu)→Drop(0.3)→Dense(64,relu)→Drop(0.2)→Dense(32,relu)→Dense(4,softmax)",
        "epochs_trained": len(history.history["loss"]),
        "epochs_max": epochs,
        "batch_size": batch_size,
        "drop_household": drop_household,
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2))

    print(f"\nModelo Keras guardado en : {keras_path}")
    print(f"Bundle joblib guardado en: {bundle_path}")
    print(f"Scaler guardado en       : {scaler_path}")
    print(f"Métricas guardadas en    : {metrics_path}")


if __name__ == "__main__":
    main()
