#!/usr/bin/env python
"""
Análisis exploratorio del dataset LPMC (London Passenger Mode Choice).

Entrada : data/raw/LPMC_dataset.csv
Salida  : artifacts/lpmc_column_summary.csv  — resumen por columna (tipo, únicos, ejemplos)
          artifacts/lpmc_column_summary.json  — mismo contenido en JSON para consultas programáticas

Uso:
    python 01_explore.py

Este script no modifica el dataset ni genera artefactos de modelo. Su único
propósito es entender la estructura del CSV original antes de pasar al
preprocesado (02_preprocess.py).
"""

from pathlib import Path
import json
import io

import pandas as pd

ROOT = Path(__file__).resolve().parent
RAW_PATH = ROOT / "data" / "raw" / "LPMC_dataset.csv"
ARTIFACTS_DIR = ROOT / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    print(f"Leyendo dataset desde: {RAW_PATH}")
    df = pd.read_csv(RAW_PATH)

    print("\n=== Forma del dataset ===")
    print(df.shape)

    print("\n=== Primeras filas ===")
    print(df.head())

    print("\n=== Info de columnas ===")
    buf = io.StringIO()
    df.info(buf=buf)
    info_str = buf.getvalue()
    print(info_str)

    # Resumen por columna: tipo, número de valores únicos y muestra de valores.
    # Para columnas con ≤10 únicos se muestran todos; para las demás, los 5 primeros.
    summary_rows = []
    for col in df.columns:
        s = df[col]
        n_unique = s.nunique(dropna=True)
        dtype = str(s.dtype)

        if n_unique <= 10:
            sample_vals = sorted(map(str, s.dropna().unique()))[:10]
        else:
            sample_vals = sorted(map(str, s.dropna().unique()))[:5]

        summary_rows.append(
            {
                "column": col,
                "dtype": dtype,
                "non_null": int(s.notna().sum()),
                "n_unique": int(n_unique),
                "sample_values": ", ".join(sample_vals),
            }
        )

    summary_df = pd.DataFrame(summary_rows).sort_values("column")
    summary_csv_path = ARTIFACTS_DIR / "lpmc_column_summary.csv"
    summary_df.to_csv(summary_csv_path, index=False)

    print(f"\nResumen de columnas guardado en: {summary_csv_path}")

    summary_json_path = ARTIFACTS_DIR / "lpmc_column_summary.json"
    with summary_json_path.open("w", encoding="utf-8") as f:
        json.dump(summary_rows, f, indent=2, ensure_ascii=False)

    print(f"Resumen JSON guardado en: {summary_json_path}")


if __name__ == "__main__":
    main()
