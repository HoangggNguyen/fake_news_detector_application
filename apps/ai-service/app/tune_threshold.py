"""Chọn ngưỡng độ tin cậy của classifier trên tập validation, rồi đánh giá một lần trên test.

Quy tắc chọn (cố định trước khi xem số liệu):
  - Xét các ngưỡng 0,50; 0,55; ...; 0,95.
  - Ngưỡng hợp lệ khi trên val: model kết luận >= MIN_CONCLUDED mẫu và độ chính xác
    trên các mẫu được kết luận (selective accuracy) >= MIN_PRECISION.
  - Chọn ngưỡng hợp lệ THẤP NHẤT (kết luận được nhiều tin nhất).
  - Nếu không ngưỡng nào hợp lệ, giữ ngưỡng mặc định 0,9.
Tập test chỉ được dùng sau khi ngưỡng đã chốt. Ngưỡng được ghi vào artifact
(`decision_threshold`) để `/dataset/classify` sử dụng.

Chạy từ apps/ai-service:
    python -m app.tune_threshold --val vfnd_original/val.csv --test vfnd_original/test.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

import joblib

from app.classifier import predict_style
from app.dataset_lookup import DEFAULT_DECISION_THRESHOLD

CANDIDATES = [round(0.5 + 0.05 * step, 2) for step in range(10)]
MIN_PRECISION = 0.90
MIN_CONCLUDED = 5

# (độ tin cậy hoặc None nếu model từ chối vì quá ngắn, dự đoán đúng hay không)
Prediction = tuple[float | None, bool | None]


def predict_rows(artifact: dict[str, Any], path: Path) -> list[Prediction]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    results: list[Prediction] = []
    for row in rows:
        expected = "fake" if row["label"].strip() == "1" else "real"
        try:
            signal = predict_style(artifact, row["text"])
        except ValueError:
            results.append((None, None))
            continue
        results.append((signal["confidence"], signal["label"] == expected))
    return results


def summarize(predictions: list[Prediction], threshold: float) -> dict[str, Any]:
    concluded = [correct for confidence, correct in predictions if confidence is not None and confidence >= threshold]
    total = len(predictions)
    return {
        "threshold": threshold,
        "samples": total,
        "concluded": len(concluded),
        "coverage": len(concluded) / total if total else 0.0,
        "correct": int(sum(concluded)),
        "selective_accuracy": sum(concluded) / len(concluded) if concluded else None,
    }


def select_threshold(
    predictions: list[Prediction],
    candidates: list[float] = CANDIDATES,
    min_precision: float = MIN_PRECISION,
    min_concluded: int = MIN_CONCLUDED,
) -> tuple[float, bool, list[dict[str, Any]]]:
    table = [summarize(predictions, threshold) for threshold in candidates]
    for row in table:
        accuracy = row["selective_accuracy"]
        if row["concluded"] >= min_concluded and accuracy is not None and accuracy >= min_precision:
            return row["threshold"], True, table
    return DEFAULT_DECISION_THRESHOLD, False, table


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--val", type=Path, required=True)
    parser.add_argument("--test", type=Path, required=True)
    parser.add_argument("--artifact", type=Path, default=Path("../../ml/artifacts/classifier.joblib"))
    args = parser.parse_args()

    artifact = joblib.load(args.artifact)
    threshold, met, val_table = select_threshold(predict_rows(artifact, args.val))
    test_result = summarize(predict_rows(artifact, args.test), threshold)
    report = {
        "rule": {
            "candidates": CANDIDATES,
            "min_selective_accuracy": MIN_PRECISION,
            "min_concluded": MIN_CONCLUDED,
            "choose": "lowest qualifying threshold on validation",
            "fallback": DEFAULT_DECISION_THRESHOLD,
        },
        "model_version": artifact.get("model_version"),
        "selected_threshold": threshold,
        "criterion_met_on_validation": met,
        "validation": val_table,
        "test_at_selected_threshold": test_result,
    }
    artifact["decision_threshold"] = threshold
    artifact["threshold_selection"] = report
    joblib.dump(artifact, args.artifact)
    (args.artifact.parent / "threshold_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
