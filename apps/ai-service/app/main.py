from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from app.classifier import predict_style
from app.dataset_lookup import DatasetLookup

logger = logging.getLogger(__name__)
repository_root = Path(__file__).resolve().parents[3]
load_dotenv(repository_root / ".env")


def resolve_model_path() -> Path:
    configured_path = Path(os.getenv("MODEL_PATH", "ml/artifacts/classifier.joblib"))
    if configured_path.is_absolute():
        return configured_path
    return repository_root / configured_path


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.classifier_artifact = None
    application.state.dataset_lookup = None
    try:
        dataset_root = Path(__file__).resolve().parents[1]
        application.state.dataset_lookup = DatasetLookup([
            dataset_root / "vfnd_dataset_1000" / "train.csv",
            dataset_root / "vfnd_dataset_deduplicated" / "train.csv",
        ])
    except (OSError, ValueError):
        logger.exception("Training datasets could not be loaded.")
    model_path = resolve_model_path()
    try:
        artifact = joblib.load(model_path)
        if not isinstance(artifact, dict) or "pipeline" not in artifact:
            raise ValueError("Classifier artifact does not contain a pipeline.")
        application.state.classifier_artifact = artifact
        logger.info("Classifier model loaded: %s", artifact.get("model_name", "unknown"))
    except FileNotFoundError:
        logger.info("Classifier model is not trained yet; path=%s", model_path)
    except Exception:
        logger.exception("Classifier model could not be loaded.")
    yield


app = FastAPI(title="Fake News Detector AI Service", version="0.2.0", lifespan=lifespan)


class PredictionRequest(BaseModel):
    text: str = Field(min_length=10, max_length=100_000)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ai-service",
        "classifier": "ready" if app.state.classifier_artifact else "unavailable",
    }


@app.get("/model/status")
def model_status() -> dict[str, Any]:
    artifact = app.state.classifier_artifact
    if artifact is None:
        return {"available": False, "model_name": None, "model_version": None}
    return {
        "available": True,
        "model_name": artifact.get("model_name"),
        "model_version": artifact.get("model_version"),
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, Any]:
    artifact = app.state.classifier_artifact
    if artifact is None:
        raise HTTPException(status_code=503, detail="Classifier model has not been trained or loaded.")
    try:
        return predict_style(artifact, request.text)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/dataset/classify")
def classify_dataset(request: PredictionRequest) -> dict[str, Any]:
    lookup = app.state.dataset_lookup
    if lookup is None:
        raise HTTPException(status_code=503, detail="Training datasets are unavailable.")
    return lookup.classify(request.text, app.state.classifier_artifact)
