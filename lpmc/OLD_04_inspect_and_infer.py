#!/usr/bin/env python

import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay
import matplotlib.pyplot as plt

BASE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data" / "preprocessed"
MODELS_DIR = BASE_DIR / "models"

MODEL_CANDIDATES = [
    MODELS_DIR / "xgb_lpmc_tuned_nohh.joblib",
    MODELS_DIR / "xgb_lpmc_baseline_nohh.joblib",
    MODELS_DIR / "xgb_lpmc_tuned.joblib",
    MODELS_DIR / "xgb_lpmc_baseline.joblib",
]
SCALER_CANDIDATES = [
    MODELS_DIR / "xgb_lpmc_scaler_nohh.joblib",
    MODELS_DIR / "xgb_lpmc_scaler.joblib",
]

MODE_LABELS = {
    0: "walk",
    1: "cycle",
    2: "pt",
    3: "drive",
}


def pick_first_existing(paths: list[pathlib.Path]) -> pathlib.Path:
    for p in paths:
        if p.exists():
            return p
    raise FileNotFoundError(f"No se encontro ningun fichero en: {paths}")


def main() -> None:
    model_path = pick_first_existing(MODEL_CANDIDATES)
    scaler_path = pick_first_existing(SCALER_CANDIDATES)

    model_bundle = joblib.load(model_path)
    scaler_bundle = joblib.load(scaler_path)

    clf = model_bundle["model"]
    feature_names = model_bundle["feature_names"]
    scaler = scaler_bundle["scaler"]
    scaled_features = scaler_bundle["scaled_features"]

    print("=== Modelo cargado ===")
    print(f"Ruta modelo : {model_path}")
    print(f"Ruta scaler : {scaler_path}")
    print(f"N columnas  : {len(feature_names)}")
    print(f"Primeras 20: {feature_names[:20]}")
    print("\nColumnas escaladas:")
    print(scaled_features)
    print()

    test_path = DATA_DIR / "LPMC_test.csv"
    print(f"Leyendo test de: {test_path}")
    test = pd.read_csv(test_path)

    target_col = "travel_mode"
    y_test = test[target_col].astype(int).values
    X_test = test.drop(columns=[target_col])

    missing_in_test = set(feature_names) - set(X_test.columns)
    if missing_in_test:
        print("\nColumnas que faltaban en test y se anaden con 0:")
        print(missing_in_test)
        for c in missing_in_test:
            X_test[c] = 0.0

    extra_in_test = set(X_test.columns) - set(feature_names)
    if extra_in_test:
        print("\nColumnas extra en test que se eliminan:")
        print(extra_in_test)
        X_test = X_test.drop(columns=list(extra_in_test))

    X_test = X_test[feature_names]

    X_test_scaled = X_test.copy()
    X_test_scaled[scaled_features] = scaler.transform(X_test[scaled_features])

    print("\n=== Ejemplos individuales (primeras 5 filas del test) ===")
    proba = clf.predict_proba(X_test_scaled)
    y_pred = clf.predict(X_test_scaled)

    for i in range(min(5, len(y_test))):
        true_label = int(y_test[i])
        pred_label = int(y_pred[i])
        probs = proba[i]

        print(f"\nEjemplo #{i}")
        print(f"  True: {true_label} ({MODE_LABELS.get(true_label)})")
        print(f"  Pred: {pred_label} ({MODE_LABELS.get(pred_label)})")
        for k, p in enumerate(probs):
            print(f"    P({MODE_LABELS[k]}) = {p:.3f}")

    print("\n=== Matriz de confusion (test) ===")
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1, 2, 3])
    print(cm)

    try:
        disp = ConfusionMatrixDisplay(
            confusion_matrix=cm,
            display_labels=[MODE_LABELS[i] for i in [0, 1, 2, 3]],
        )
        disp.plot(cmap="Blues", xticks_rotation=45)
        plt.tight_layout()
        plt.show()
    except Exception as e:
        print(f"No se ha podido mostrar la matriz de confusion: {e}")


if __name__ == "__main__":
    main()
