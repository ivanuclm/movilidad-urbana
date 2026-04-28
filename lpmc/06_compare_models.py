#!/usr/bin/env python
"""
Genera las tablas comparativas de Accuracy y GMPCA para los tres modelos
entrenados sobre el dataset LPMC (RandomForest, XGBoost, DNN).

Uso:
    python 07_compare_models.py

Salida:
    - Tabla en texto plano por consola
    - artifacts/lpmc_model_comparison.json  (métricas consolidadas)
    - artifacts/lpmc_comparison_train.tex   (tabla LaTeX, conjunto train)
    - artifacts/lpmc_comparison_test.tex    (tabla LaTeX, conjunto test)

Los ficheros .tex están listos para incluir con \\input{} en el capítulo 5.
"""

import json
import pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"

MODELS = [
    {
        "label": "Random Forest",
        "metrics_file": "rf_lpmc_metrics.json",
    },
    {
        "label": "XGBoost",
        "metrics_file": "xgb_lpmc_metrics.json",
    },
    {
        "label": "DNN",
        "metrics_file": "dnn_lpmc_metrics.json",
    },
]


def load_metrics(metrics_file: str) -> dict | None:
    path = ARTIFACTS_DIR / metrics_file
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)


def pct(value: float) -> str:
    return f"{value * 100:.2f}"


def print_table(rows: list[dict], split: str, display_name: str) -> None:
    header = f"{'Modelo':<18}  {'Accuracy':>10}  {'GMPCA':>8}"
    sep = "-" * len(header)
    print(f"\n  {display_name}")
    print(f"  {sep}")
    print(f"  {header}")
    print(f"  {sep}")
    for row in rows:
        if row["metrics"] is None or row["metrics"].get(split) is None:
            print(f"  {row['label']:<18}  {'(no entrenado)':>10}")
        else:
            m = row["metrics"][split]
            print(f"  {row['label']:<18}  {pct(m['accuracy']):>9}%  {pct(m['gmpca']):>7}%")
    print(f"  {sep}")


def build_latex_table(rows: list[dict], split: str, caption: str, label: str) -> str:
    lines = []
    lines.append(r"\begin{table}[htbp]")
    lines.append(r"\caption{" + caption + r"}")
    lines.append(r"\label{" + label + r"}")
    lines.append(r"\centering")
    lines.append(r"\begin{tabular}{lcc}")
    lines.append(r"\toprule")
    lines.append(r"Modelo & Accuracy (\%) & GMPCA (\%) \\")
    lines.append(r"\midrule")
    for row in rows:
        m = (row["metrics"] or {}).get(split)
        if m is None:
            lines.append(f"{row['label']} & -- & -- \\\\")
        else:
            lines.append(f"{row['label']} & {pct(m['accuracy'])} & {pct(m['gmpca'])} \\\\")
    lines.append(r"\bottomrule")
    lines.append(r"\end{tabular}")
    lines.append(r"\end{table}")
    return "\n".join(lines)


def main() -> None:
    rows = []
    for model_def in MODELS:
        metrics = load_metrics(model_def["metrics_file"])
        rows.append({"label": model_def["label"], "metrics": metrics})
        if metrics is None:
            print(f"[AVISO] No encontrado: {model_def['metrics_file']} — modelo no entrenado todavía.")

    print_table(rows, "train_cv", "TRAIN (5-fold GroupKFold CV, household_id como grupo)")
    print_table(rows, "test", "TEST SET")

    # JSON consolidado
    consolidated = {
        row["label"]: row["metrics"]
        for row in rows
        if row["metrics"] is not None
    }
    out_json = ARTIFACTS_DIR / "lpmc_model_comparison.json"
    out_json.write_text(json.dumps(consolidated, indent=2))
    print(f"\nJSON consolidado guardado en: {out_json}")

    # LaTeX train
    latex_train = build_latex_table(
        rows,
        split="train_cv",
        caption="Resultados en entrenamiento con validación cruzada de 5 pliegues agrupada por hogar (dataset LPMC)",
        label="tab:lpmc_train_results",
    )
    out_train = ARTIFACTS_DIR / "lpmc_comparison_train.tex"
    out_train.write_text(latex_train)
    print(f"LaTeX (train) guardado en   : {out_train}")

    # LaTeX test
    latex_test = build_latex_table(
        rows,
        split="test",
        caption="Resultados en el conjunto de test (dataset LPMC)",
        label="tab:lpmc_test_results",
    )
    out_test = ARTIFACTS_DIR / "lpmc_comparison_test.tex"
    out_test.write_text(latex_test)
    print(f"LaTeX (test) guardado en    : {out_test}")

    print("\nPara incluir en el capítulo 5:")
    print(r"  \input{../lpmc/artifacts/lpmc_comparison_train}")
    print(r"  \input{../lpmc/artifacts/lpmc_comparison_test}")


if __name__ == "__main__":
    main()
