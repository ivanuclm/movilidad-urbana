#!/usr/bin/env python
"""
Preprocesado del dataset LPMC para entrenamiento de modelos de elección modal.

Entrada : data/raw/LPMC_dataset.csv
Salida  : data/preprocessed/LPMC_train.csv  — viajes de survey_year 1 y 2
          data/preprocessed/LPMC_test.csv   — viajes de survey_year 3
          data/processed/LPMC_processed.csv — dataset completo ya transformado (sin split)

Transformaciones aplicadas:
  - purpose       → one-hot (5 columnas: B, HBE, HBO, HBW, NHBO)
  - fueltype      → consolidación de 6 categorías a 4 + one-hot (4 columnas)
  - travel_mode   → codificación numérica: walk=0, cycle=1, pt=2, drive=3
  - survey_year   → usado como criterio de split temporal; eliminado del CSV de salida
  - 12 columnas   → eliminadas (identificadores, variables derivadas o no usadas)

Split temporal (no aleatorio): años 1 y 2 como train, año 3 como test. Esta
estrategia evita contaminación temporal que habría con un split aleatorio y es
consistente con la metodología del tutor (Martín Baos, 2023).

Uso:
    python 02_preprocess.py
"""

from pathlib import Path
import pandas as pd

pd.set_option("display.max_columns", 150)

ROOT = Path(__file__).resolve().parent
RAW_PATH = ROOT / "data" / "raw" / "LPMC_dataset.csv"
OUT_DIR = ROOT / "data" / "preprocessed"
PROCESSED_PATH = ROOT / "data" / "processed" / "LPMC_processed.csv"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_PATH.parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    print(f"Leyendo dataset bruto desde: {RAW_PATH}")
    df = pd.read_csv(RAW_PATH)

    print("Forma inicial:", df.shape)

    # --- Codificación de variables categóricas ---

    # purpose: motivo del viaje (B=business, HBE=home-based education,
    # HBO=home-based other, HBW=home-based work, NHBO=non-home-based other).
    # Se convierte a 5 columnas binarias con get_dummies.
    purpose_df = pd.get_dummies(df["purpose"], prefix="purpose")
    df = df.join(purpose_df)
    df = df.drop(columns=["purpose"])

    # faretype no se usa en el modelo de referencia del tutor; se elimina.
    df = df.drop(columns=["faretype"])

    # fueltype: el dataset original tiene 6 categorías; se consolidan a 4.
    # Petrol_LGV se agrupa con Diesel_Car/Diesel_LGV (el tutor los unifica
    # en Diesel). Hybrid y Average se mantienen como categorías propias.
    fuel_map = {
        "Petrol_Car": "Petrol",
        "Petrol_LGV": "Diesel",
        "Diesel_Car": "Diesel",
        "Diesel_LGV": "Diesel",
        "Hybrid_Car": "Hybrid",
        "Average_Car": "Average",
    }
    df["fueltype"] = df["fueltype"].map(fuel_map)

    fueltype_df = pd.get_dummies(df["fueltype"], prefix="fueltype")
    df = df.join(fueltype_df)
    df = df.drop(columns=["fueltype"])

    # travel_mode: variable objetivo numérica. El orden walk < cycle < pt < drive
    # es arbitrario; los clasificadores multiclase no imponen ordenación entre clases.
    mode_map = {"walk": 0, "cycle": 1, "pt": 2, "drive": 3}
    df["travel_mode"] = df["travel_mode"].map(mode_map)

    # Columnas eliminadas y justificación:
    #   trip_id, person_n, trip_n  → identificadores únicos sin poder predictivo
    #   travel_year, travel_month, travel_date → granularidad excesiva;
    #       day_of_week y start_time_linear ya capturan el efecto temporal relevante
    #   bus_scale      → variable de política exógena, no disponible en inferencia
    #   dur_pt_total   → total derivable de sus componentes (access + bus + rail + int)
    #   dur_pt_int_total → total de tiempos de intercambio, redundante con sus partes
    #   cost_driving_fuel, cost_driving_con_charge → componentes de cost_driving_total
    #   driving_traffic_percent → correlacionada con dur_driving; aporta info redundante
    cols_to_drop = [
        "trip_id",
        "person_n",
        "trip_n",
        "travel_year",
        "travel_month",
        "travel_date",
        "bus_scale",
        "dur_pt_total",
        "dur_pt_int_total",
        "cost_driving_fuel",
        "cost_driving_con_charge",
        "driving_traffic_percent",
    ]
    df = df.drop(columns=cols_to_drop)

    print("Forma tras transformar:", df.shape)

    df.to_csv(PROCESSED_PATH, index=False)

    # Split temporal: survey_year identifica la oleada de encuesta.
    # Años 1 y 2 → train; año 3 → test (viajes más recientes como holdout).
    # Se elimina survey_year de los CSV de salida: ya no aporta información
    # después del split y los modelos no deben usarlo como feature.
    train_df = df[df["survey_year"].isin([1, 2])].copy()
    test_df = df[df["survey_year"] == 3].copy()

    train_df = train_df.drop(columns=["survey_year"])
    test_df = test_df.drop(columns=["survey_year"])

    print(f"Length of train: {train_df.shape[0]}")
    print(f"Length of test : {test_df.shape[0]}")

    train_path = OUT_DIR / "LPMC_train.csv"
    test_path = OUT_DIR / "LPMC_test.csv"

    train_df.to_csv(train_path, sep=",", index=False)
    test_df.to_csv(test_path, sep=",", index=False)

    print(f"Train guardado en: {train_path}")
    print(f"Test  guardado en: {test_path}")
    print("N columnas finales (features + target):", len(train_df.columns))


if __name__ == "__main__":
    main()
