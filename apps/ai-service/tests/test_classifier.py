from __future__ import annotations

import pandas as pd
import pytest
from joblib import load
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.classifier import (
    build_features,
    combine_labeled_frames,
    evaluate_external,
    load_labeled_csv,
    normalize_text,
    predict_style,
    train_and_evaluate,
)
from app.train import write_eda


def test_normalize_text_replaces_urls_numbers_and_normalizes_unicode() -> None:
    value = "Ca phe giam 50% tại https://example.com/a"
    normalized = normalize_text(value)
    assert "urltoken" in normalized
    assert "numtoken" in normalized
    assert "https" not in normalized
    assert "50" not in normalized


def test_loader_deduplicates_and_drops_conflicting_text_and_domain(tmp_path) -> None:
    source = tmp_path / "fixture.csv"
    pd.DataFrame([
        {"text": "Bai viet lap lai", "label": 0, "domain": "site-a.vn"},
        {"text": "Bai viet lap lai", "label": "real", "domain": "site-b.vn"},
        {"text": "Bai viet mau", "label": 0, "domain": "site-c.vn"},
        {"text": "Bai viet mau", "label": 1, "domain": "site-d.vn"},
        {"text": "Thong tin khac", "label": 1, "domain": "site-e.vn"},
    ]).to_csv(source, index=False)

    frame, diagnostics = load_labeled_csv(source)

    assert list(frame.columns) == ["text", "label"]
    assert len(frame) == 2
    assert diagnostics["duplicate_rows_removed"] == 1
    assert diagnostics["conflicting_rows_removed"] == 2


def test_loader_combines_title_with_body_when_title_column_exists(tmp_path) -> None:
    source = tmp_path / "with_title.csv"
    pd.DataFrame([
        {"title": "Tieu de mau", "text": "Noi dung bai viet", "label": 0},
        {"title": "Tieu de khac", "text": "Noi dung khac", "label": 1},
    ]).to_csv(source, index=False)

    frame, _ = load_labeled_csv(source)

    assert frame.loc[0, "text"] == "tieu de mau noi dung bai viet"


def test_combine_training_frames_removes_cross_source_duplicates_and_conflicts() -> None:
    first = pd.DataFrame([
        {"text": "same text", "label": 0},
        {"text": "conflicting text", "label": 0},
        {"text": "first real", "label": 0},
        {"text": "first fake", "label": 1},
    ])
    second = pd.DataFrame([
        {"text": "same text", "label": 0},
        {"text": "conflicting text", "label": 1},
        {"text": "second real", "label": 0},
        {"text": "second fake", "label": 1},
    ])

    combined, diagnostics = combine_labeled_frames([first, second])

    assert len(combined) == 5
    assert diagnostics == {
        "input_rows": 8,
        "conflicting_rows_removed": 2,
        "duplicate_rows_removed": 1,
        "clean_rows": 5,
    }


def test_feature_pipeline_combines_word_and_character_ngrams() -> None:
    features = build_features()
    matrix = features.fit_transform([
        "tin that co nguon ro rang",
        "tin gia noi dung gay soc",
        "tin thật được kiểm chứng",
        "tin giả gây sốc bất thường",
    ])
    assert matrix.shape[0] == 4
    assert matrix.shape[1] > 4


def test_domain_column_is_required_to_be_ignored_not_used_as_feature() -> None:
    features = build_features()
    texts = ["real public report", "fake sensational report", "real verified news", "fake fabricated news"]
    matrix = features.fit_transform(texts)
    model = Pipeline([("features", features), ("classifier", LogisticRegression(class_weight="balanced"))])
    model.fit(texts, [0, 1, 0, 1])
    probabilities = model.predict_proba(["fake fabricated report"])
    assert probabilities.shape == (1, 2)
    assert probabilities.sum() == pytest.approx(1.0)

    result = predict_style(
        {"pipeline": model, "model_name": "Logistic Regression", "model_version": "test"},
        "fake fabricated report",
    )
    assert result["label"] in {"real", "fake"}
    assert result["probabilities"]["real"] + result["probabilities"]["fake"] == pytest.approx(1.0)
    assert result["model_version"] == "test"
    assert result["top_features"]


def test_classifier_abstains_below_the_shortest_training_sample() -> None:
    texts = ["verified public report confirms event", "fabricated shocking rumor claims event"]
    model = Pipeline([
        ("features", build_features()),
        ("classifier", LogisticRegression(class_weight="balanced")),
    ]).fit(texts, [0, 1])
    with pytest.raises(ValueError, match="requires at least 5 words"):
        predict_style({
            "pipeline": model,
            "model_name": "fixture",
            "model_version": "test",
            "min_training_words": 5,
        }, "xin chao")


def test_training_compares_models_exports_artifact_and_evaluates_independent_data(tmp_path) -> None:
    rows = [
        {"text": f"verified public report confirms event record {index}", "label": 0}
        for index in range(30)
    ] + [
        {"text": f"fabricated shocking rumor claims secret event record {index}", "label": 1}
        for index in range(30)
    ]
    frame = pd.DataFrame(rows)

    result = train_and_evaluate(frame, tmp_path)
    artifact = load(tmp_path / "classifier.joblib")
    external = pd.DataFrame([
        {"text": "verified public report confirms a separate event", "label": 0},
        {"text": "fabricated shocking rumor about a separate event", "label": 1},
        {"text": frame.iloc[0]["text"], "label": 0},
    ])
    external_metrics = evaluate_external(artifact["pipeline"], external, frame["text"])

    assert len(result["comparison"]) == 4
    assert result["holdout"]["confusion_matrix_labels_0_real_1_fake"]
    assert artifact["model_name"] in {row["model"] for row in result["comparison"]}
    assert external_metrics["rows_evaluated"] == 2
    assert external_metrics["overlap_rows_removed"] == 1
    assert (tmp_path / "model_comparison.csv").exists()
    write_eda(frame, {"source_rows": len(frame), "clean_rows": len(frame)}, tmp_path)
    assert (tmp_path / "cleaned.csv").exists()
    assert (tmp_path / "eda.png").exists()
    assert (tmp_path / "eda.json").exists()