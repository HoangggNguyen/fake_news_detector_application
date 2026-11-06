from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import joblib
import pandas as pd

from app.classifier import evaluate_external, load_labeled_csv, train_and_evaluate


def write_eda(frame: pd.DataFrame, diagnostics: dict[str, int], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / "cleaned.csv", index=False, encoding="utf-8-sig")
    counts = frame["label"].value_counts().sort_index()
    lengths = frame["text"].str.split().str.len()

    figure, axes = plt.subplots(1, 2, figsize=(10, 4))
    axes[0].bar(["Real (0)", "Fake (1)"], [int(counts.get(0, 0)), int(counts.get(1, 0))])
    axes[0].set_title("Label distribution")
    axes[0].set_ylabel("Rows")
    axes[1].hist(lengths, bins=20, color="#527965")
    axes[1].set_title("Text length distribution")
    axes[1].set_xlabel("Words per sample")
    figure.tight_layout()
    figure.savefig(output_dir / "eda.png", dpi=140)
    plt.close(figure)

    report = {
        **diagnostics,
        "label_counts": {"real_0": int(counts.get(0, 0)), "fake_1": int(counts.get(1, 0))},
        "word_count": {
            "min": int(lengths.min()),
            "median": float(lengths.median()),
            "max": int(lengths.max()),
        },
    }
    (output_dir / "eda.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the Vietnamese TF-IDF baseline.")
    parser.add_argument("--input", type=Path, required=True, help="Authorized CSV with text and label columns")
    parser.add_argument("--external", type=Path, help="Optional independent labeled CSV for out-of-source testing")
    parser.add_argument("--output-dir", type=Path, default=Path("../../ml/artifacts"))
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    frame, diagnostics = load_labeled_csv(args.input)
    write_eda(frame, diagnostics, args.output_dir)
    result = train_and_evaluate(frame, args.output_dir, args.random_state)
    result["cleaning"] = diagnostics
    if args.external:
        external_frame, external_diagnostics = load_labeled_csv(args.external)
        artifact = joblib.load(args.output_dir / "classifier.joblib")
        result["external_evaluation"] = evaluate_external(
            artifact["pipeline"], external_frame, frame["text"]
        )
        result["external_cleaning"] = external_diagnostics
    (args.output_dir / "training_report.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
