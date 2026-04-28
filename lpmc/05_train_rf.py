#!/usr/bin/env python

import json
import os
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
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

DEFAULT_PARAMS: dict = {
    "n_estimators": 500,
    "max_depth": None,
    "min_samples_split": 5,
    "min_samples_leaf": 2,
    "max_features": "sqrt",
    "n_jobs": -1,
    "random_state": 42,
}


def load_best_params() -> dict:
    params_path = ARTIFACTS_DIR / "lpmc_rf_best_params.json"
    if not params_path.exists():
        return DEFAULT_PARAMS
    with params_path.open() as f:
        bundle = json.load(f)
    return bundle.get("params", DEFAULT_PARAMS)


def gmpca_from_proba(proba: np.ndarray, y_true: np.ndarray) -> float:
    """GMPCA = exp( -cross entropy )."""
    proba = np.clip(proba, 1e-12, 1.0)
    log_like = np.log(proba[np.arange(len(y_true)), y_true]).sum()
    return float(np.exp(log_like / len(y_true)))


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
    print(f"\nColumnas a escalar ({len(scaled_features)}): {scaled_features}")

    scaler = StandardScaler()
    X_train_scaled = X_train.copy()
    X_test_scaled = X_test.copy()
    X_train_scaled[scaled_features] = scaler.fit_transform(X_train[scaled_features].astype(float))
    X_test_scaled[scaled_features] = scaler.transform(X_test[scaled_features].astype(float))

    model_params = load_best_params()
    print(f"\nParámetros RF: {model_params}")

    fast_override = os.environ.get("FAST_N_ESTIMATORS")
    if fast_override:
        model_params = dict(model_params)
        model_params["n_estimators"] = int(fast_override)
        print(f"FAST_N_ESTIMATORS activo -> n_estimators={model_params['n_estimators']}")

    clf = RandomForestClassifier(**model_params)
    print("\nEntrenando RandomForest...")
    clf.fit(X_train_scaled, y_train)

    proba_train = clf.predict_proba(X_train_scaled)
    proba_test = clf.predict_proba(X_test_scaled)
    y_train_pred = clf.predict(X_train_scaled)
    y_test_pred = clf.predict(X_test_scaled)

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
    model_path = MODELS_DIR / f"rf_lpmc{suffix}.joblib"
    scaler_path = MODELS_DIR / f"rf_lpmc_scaler{suffix}.joblib"

    joblib.dump({"model": clf, "feature_names": X_train_scaled.columns.tolist()}, model_path)
    joblib.dump({"scaler": scaler, "scaled_features": scaled_features}, scaler_path)

    metrics_path = ARTIFACTS_DIR / f"rf_lpmc_metrics{suffix}.json"
    serializable_params = {k: (str(v) if v is None else v) for k, v in model_params.items()}
    metrics_payload = {
        "train": {"accuracy": acc_train, "gmpca": gmpca_train},
        "test": {"accuracy": acc_test, "gmpca": gmpca_test},
        "model_params": serializable_params,
        "drop_household": drop_household,
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2))

    print(f"\nModelo guardado en    : {model_path}")
    print(f"Scaler guardado en    : {scaler_path}")
    print(f"Métricas guardadas en : {metrics_path}")


if __name__ == "__main__":
    main()
