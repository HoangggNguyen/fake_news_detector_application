from fastapi.testclient import TestClient
import joblib
import logging
import pandas as pd
import pytest
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.classifier import build_features
from app.main import app


def test_health_stays_available_without_trained_model(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "not-trained.joblib"))
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["classifier"] == "unavailable"


def test_predict_reports_service_unavailable_without_artifact(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "not-trained.joblib"))
    with TestClient(app) as client:
        response = client.post("/predict", json={"text": "A sufficiently long sample text."})
    assert response.status_code == 503


def test_predict_returns_probability_when_artifact_is_available(monkeypatch, tmp_path) -> None:
    texts = [
        "verified public report confirms event",
        "fabricated shocking rumor claims event",
        "trusted news source confirms the report",
        "false sensational story spreads quickly",
    ]
    labels = [0, 1, 0, 1]
    pipeline = Pipeline([
        ("features", build_features()),
        ("classifier", LogisticRegression(class_weight="balanced")),
    ])
    pipeline.fit(texts, labels)
    model_path = tmp_path / "classifier.joblib"
    joblib.dump({
        "pipeline": pipeline,
        "model_name": "Logistic Regression",
        "model_version": "test-fixture",
        "min_training_words": 4,
    }, model_path)
    monkeypatch.setenv("MODEL_PATH", str(model_path))

    with TestClient(app) as client:
        response = client.post("/predict", json={"text": "A fabricated rumor claims event."})

    assert response.status_code == 200
    body = response.json()
    assert body["label"] in {"real", "fake"}
    assert body["probabilities"]["real"] + body["probabilities"]["fake"] == pytest.approx(1.0)
    assert body["model_version"] == "test-fixture"

    with TestClient(app) as client:
        short_response = client.post("/predict", json={"text": "xin chao"})
    assert short_response.status_code == 422


def test_missing_optional_dataset_keeps_existing_lookup(monkeypatch, tmp_path, caplog) -> None:
    paths_seen = []
    existing_is_file = Path.is_file

    def is_file(path):
        if path.parent.name == "vfnd_dataset_10000_full":
            return False
        return existing_is_file(path)

    def create_lookup(paths):
        paths_seen.extend(paths)
        return object()

    monkeypatch.setattr(Path, "is_file", is_file)
    monkeypatch.setattr("app.main.DatasetLookup", create_lookup)
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "not-trained.joblib"))
    with caplog.at_level(logging.WARNING), TestClient(app):
        assert app.state.dataset_lookup is not None
    assert len(paths_seen) == 3
    assert "Optional training dataset is missing" in caplog.text