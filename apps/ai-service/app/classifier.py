from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any, cast

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import (
    StratifiedKFold,
    cross_validate,
    train_test_split,
)
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

LABEL_MAP = {
    "0": 0,
    "real": 0,
    "true": 0,
    "thật": 0,
    "1": 1,
    "fake": 1,
    "false": 1,
    "giả": 1,
}
URL_PATTERN = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)*")
SPECIAL_PATTERN = re.compile(r"[^\w\s]", re.UNICODE)
WHITESPACE_PATTERN = re.compile(r"\s+")
MODEL_VERSION = "tfidf-baseline-v1"


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFC", str(value)).lower()
    text = URL_PATTERN.sub(" urltoken ", text)
    text = NUMBER_PATTERN.sub(" numtoken ", text)
    text = SPECIAL_PATTERN.sub(" ", text)
    return WHITESPACE_PATTERN.sub(" ", text).strip()


def load_labeled_csv(path: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    source = pd.read_csv(path, encoding="utf-8-sig")
    columns = {str(column).strip().casefold(): column for column in source.columns}
    if "text" not in columns or "label" not in columns:
        raise ValueError("CSV phải có hai cột text và label; cột domain sẽ bị bỏ qua.")

    frame = pd.DataFrame({"text": source[columns["text"]], "label": source[columns["label"]]})
    if "title" in columns:
        title = source[columns["title"]].fillna("").astype(str).str.strip()
        body = frame["text"].fillna("").astype(str).str.strip()
        frame["text"] = title.str.cat(body, sep=" ").str.strip()
    frame["text"] = frame["text"].fillna("").astype(str).map(normalize_text)
    frame["label"] = frame["label"].map(
        lambda value: LABEL_MAP.get(str(value).strip().casefold())
    )
    valid_rows = frame["text"].ne("") & frame["label"].notna()
    invalid_rows = int((~valid_rows).sum())
    frame = frame.loc[valid_rows].copy()
    frame["label"] = frame["label"].astype(int)

    label_conflicts = frame.groupby("text")["label"].nunique()
    conflicting_texts = set(label_conflicts[label_conflicts > 1].index)
    conflict_rows = int(frame["text"].isin(conflicting_texts).sum())
    frame = frame.loc[~frame["text"].isin(conflicting_texts)]
    before_deduplication = len(frame)
    frame = frame.drop_duplicates(subset="text", keep="first").reset_index(drop=True)

    diagnostics = {
        "source_rows": len(source),
        "invalid_rows_removed": invalid_rows,
        "conflicting_rows_removed": conflict_rows,
        "duplicate_rows_removed": before_deduplication - len(frame),
        "clean_rows": len(frame),
    }
    if frame["label"].nunique() != 2:
        raise ValueError("Sau làm sạch cần còn đủ hai nhãn thật (0) và giả (1).")
    return frame, diagnostics


def combine_labeled_frames(
    frames: list[pd.DataFrame],
) -> tuple[pd.DataFrame, dict[str, int]]:
    if not frames:
        raise ValueError("Cần ít nhất một tập dữ liệu huấn luyện.")

    combined = pd.concat(frames, ignore_index=True)
    label_counts = combined.groupby("text")["label"].nunique()
    conflicting_texts = set(label_counts[label_counts > 1].index)
    conflict_rows = int(combined["text"].isin(conflicting_texts).sum())
    combined = combined.loc[~combined["text"].isin(conflicting_texts)]

    before_deduplication = len(combined)
    combined = combined.drop_duplicates(subset="text", keep="first").reset_index(drop=True)
    diagnostics = {
        "input_rows": sum(len(frame) for frame in frames),
        "conflicting_rows_removed": conflict_rows,
        "duplicate_rows_removed": before_deduplication - len(combined),
        "clean_rows": len(combined),
    }
    if combined["label"].nunique() != 2:
        raise ValueError("Sau khi gộp cần còn đủ hai nhãn thật (0) và giả (1).")
    return combined, diagnostics


def build_features() -> FeatureUnion:
    return FeatureUnion([
        (
            "word_tfidf",
            cast(Any, TfidfVectorizer(
                preprocessor=normalize_text,
                lowercase=False,
                token_pattern=r"(?u)\b\w+\b",
                ngram_range=(1, 2),
                sublinear_tf=True,
                min_df=1,
            )),
        ),
        (
            "char_tfidf",
            cast(Any, TfidfVectorizer(
                preprocessor=normalize_text,
                lowercase=False,
                analyzer="char",
                ngram_range=(2, 4),
                sublinear_tf=True,
                min_df=1,
            )),
        ),
    ])


def build_candidates(random_state: int = 42) -> dict[str, Pipeline]:
    classifiers = {
        "Multinomial Naive Bayes": MultinomialNB(alpha=0.5, fit_prior=False),
        "Logistic Regression": LogisticRegression(
            class_weight="balanced", max_iter=2000, random_state=random_state
        ),
        "Linear SVM": CalibratedClassifierCV(
            estimator=LinearSVC(class_weight="balanced", random_state=random_state),
            cv=3,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=150,
            class_weight="balanced_subsample",
            max_features="sqrt",
            n_jobs=-1,
            random_state=random_state,
        ),
    }
    return {
        name: Pipeline([("features", build_features()), ("classifier", classifier)])
        for name, classifier in classifiers.items()
    }


def predict_style(artifact: dict[str, Any], text: str) -> dict[str, Any]:
    word_count = len(normalize_text(text).split())
    minimum_training_words = int(artifact.get("min_training_words", 0))
    if word_count < minimum_training_words:
        raise ValueError(
            f"Classifier requires at least {minimum_training_words} words; received {word_count}."
        )

    pipeline: Pipeline = artifact["pipeline"]
    predicted_label = int(pipeline.predict([text])[0])
    classes = [int(label) for label in pipeline.classes_]
    probabilities = pipeline.predict_proba([text])[0]
    probability_by_class = {
        label: float(probability)
        for label, probability in zip(classes, probabilities, strict=True)
    }
    fake_probability = probability_by_class[1]
    result: dict[str, Any] = {
        "label": "fake" if predicted_label == 1 else "real",
        "confidence": float(max(probabilities)),
        "probabilities": {
            "real": probability_by_class[0],
            "fake": fake_probability,
        },
        "model_name": artifact["model_name"],
        "model_version": artifact["model_version"],
        "top_features": [],
    }

    classifier = pipeline.named_steps["classifier"]
    coefficients = getattr(classifier, "coef_", None)
    if coefficients is None:
        calibrated_models = getattr(classifier, "calibrated_classifiers_", [])
        linear_weights = [
            model.estimator.coef_[0]
            for model in calibrated_models
            if getattr(model.estimator, "coef_", None) is not None
        ]
        if linear_weights:
            coefficients = np.mean(np.vstack(linear_weights), axis=0, keepdims=True)
    if coefficients is not None:
        feature_matrix = pipeline.named_steps["features"].transform([text]).tocsr()
        feature_names = pipeline.named_steps["features"].get_feature_names_out()
        weights = np.asarray(coefficients).reshape(-1)
        contributions = feature_matrix.data * weights[feature_matrix.indices]
        top_positions = np.argsort(np.abs(contributions))[-5:][::-1]
        result["top_features"] = [
            {
                "feature": str(feature_names[feature_matrix.indices[position]]),
                "direction": "fake" if contributions[position] > 0 else "real",
            }
            for position in top_positions
        ]
    return result


def _metric_summary(expected: np.ndarray, predicted: np.ndarray) -> dict[str, Any]:
    return {
        "accuracy": float(accuracy_score(expected, predicted)),
        "precision_macro": float(precision_score(expected, predicted, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(expected, predicted, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(expected, predicted, average="macro", zero_division=0)),
        "confusion_matrix_labels_0_real_1_fake": confusion_matrix(
            expected, predicted, labels=[0, 1]
        ).tolist(),
    }


def evaluate_external(
    pipeline: Pipeline,
    external_frame: pd.DataFrame,
    training_texts: pd.Series,
) -> dict[str, Any]:
    training_set = set(training_texts)
    overlap = external_frame["text"].isin(training_set)
    independent_frame = external_frame.loc[~overlap]
    if independent_frame.empty:
        raise ValueError("External evaluation set has no independent samples after overlap removal.")
    prediction = cast(np.ndarray, pipeline.predict(independent_frame["text"]))
    return {
        **_metric_summary(independent_frame["label"].to_numpy(), prediction),
        "rows_evaluated": len(independent_frame),
        "overlap_rows_removed": int(overlap.sum()),
    }


def train_and_evaluate(
    frame: pd.DataFrame,
    output_dir: Path,
    random_state: int = 42,
) -> dict[str, Any]:
    if frame["label"].value_counts().min() < 5:
        raise ValueError("Cần tối thiểu 5 mẫu mỗi lớp để dùng stratified 5-fold CV.")

    train_text, holdout_text, train_labels, holdout_labels = train_test_split(
        frame["text"],
        frame["label"],
        test_size=0.2,
        random_state=random_state,
        stratify=frame["label"],
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
    scoring = {
        "accuracy": "accuracy",
        "precision_macro": "precision_macro",
        "recall_macro": "recall_macro",
        "f1_macro": "f1_macro",
    }
    comparisons: list[dict[str, Any]] = []
    candidates = build_candidates(random_state)
    best_name: str | None = None
    best_score = -1.0

    for name, pipeline in candidates.items():
        cv_result = cross_validate(
            pipeline,
            train_text,
            train_labels,
            scoring=scoring,
            cv=cv,
            error_score="raise",
            n_jobs=1,
        )
        row: dict[str, Any] = {"model": name}
        for metric in scoring:
            values = cv_result[f"test_{metric}"]
            row[f"{metric}_mean"] = float(np.mean(values))
            row[f"{metric}_std"] = float(np.std(values))
        comparisons.append(row)
        if row["f1_macro_mean"] > best_score:
            best_name = name
            best_score = row["f1_macro_mean"]

    if best_name is None:
        raise RuntimeError("Không huấn luyện được mô hình nào.")

    selected = candidates[best_name]
    selected.fit(train_text, train_labels)
    holdout_prediction = cast(np.ndarray, selected.predict(holdout_text))
    holdout_metrics = _metric_summary(holdout_labels.to_numpy(), holdout_prediction)
    holdout_metrics["target_accuracy_and_macro_f1_at_least_85_percent"] = bool(
        holdout_metrics["accuracy"] >= 0.85 and holdout_metrics["f1_macro"] >= 0.85
    )

    final_pipeline = candidates[best_name]
    final_pipeline.fit(frame["text"], frame["label"])

    output_dir.mkdir(parents=True, exist_ok=True)
    min_training_words = min(len(text.split()) for text in frame["text"].astype(str))
    comparison_frame = pd.DataFrame(comparisons).sort_values(
        "f1_macro_mean", ascending=False
    )
    comparison_frame.to_csv(output_dir / "model_comparison.csv", index=False)
    artifact = {
        "pipeline": final_pipeline,
        "model_name": best_name,
        "model_version": MODEL_VERSION,
        "min_training_words": min_training_words,
        "class_labels": {0: "real", 1: "fake"},
        "metrics": {
            "selection_metric": "5-fold CV macro-F1 on the training split",
            "holdout": holdout_metrics,
            "cv_comparison": comparisons,
        },
    }
    joblib.dump(artifact, output_dir / "classifier.joblib")
    return {
        "selected_model": best_name,
        "selection_metric": best_score,
        "holdout": holdout_metrics,
        "comparison": comparisons,
        "artifact_path": str(output_dir / "classifier.joblib"),
    }
