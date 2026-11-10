from __future__ import annotations

import csv
import logging
import re
import unicodedata
from pathlib import Path
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer

from app.classifier import LABEL_MAP, predict_style

logger = logging.getLogger(__name__)

TITLE_SUFFIX = re.compile(r"\s*\((?:Mẫu|Cập nhật đợt|Cảnh báo mẫu)\s*#\d+\)\s*$", re.IGNORECASE)
# Ngưỡng mặc định khi artifact chưa có decision_threshold (chọn bằng app.tune_threshold).
DEFAULT_DECISION_THRESHOLD = 0.9
TITLE_CATEGORY = re.compile(r"^\s*\[[^\]]+\]\s*")


def match_key(text: str) -> str:
    text = unicodedata.normalize("NFC", text).casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


def title_key(title: str) -> str:
    title = TITLE_SUFFIX.sub("", title)
    has_category = bool(TITLE_CATEGORY.match(title))
    title = TITLE_CATEGORY.sub("", title)
    if not has_category and " - " in title:
        title = title.split(" - ", 1)[1]
    return match_key(title)


class DatasetLookup:
    def __init__(self, paths: list[Path]) -> None:
        self.samples: list[dict[str, str]] = []
        seen: set[tuple[str, str, str]] = set()
        for path in paths:
            with path.open(encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream)
                required = {"id", "title", "text", "domain", "label"}
                if not required.issubset(reader.fieldnames or []):
                    raise ValueError(f"Dataset has missing columns: {path}")
                for row_number, row in enumerate(reader, 2):
                    label = LABEL_MAP.get((row.get("label") or "").strip().casefold())
                    if label is None or not all((row.get(field) or "").strip() for field in ("id", "title", "text", "domain")):
                        logger.warning("Skipping invalid training row %s in %s", row_number, path)
                        continue
                    key = (title_key(row["title"]), match_key(row["text"]), str(label))
                    if key in seen:
                        continue
                    seen.add(key)
                    self.samples.append({
                        "id": row["id"], "title": row["title"], "text": row["text"],
                        "source": row.get("source") or row["domain"],
                        "source_url": row.get("source_url") or "",
                        "dataset": path.parent.name, "label": "fake" if label else "real",
                    })
        if not self.samples:
            raise ValueError("No training samples found.")
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), token_pattern=r"(?u)\b\w+\b")
        self.matrix = self.vectorizer.fit_transform([title_key(row["title"]) for row in self.samples])

    def classify(self, text: str, artifact: dict[str, Any] | None) -> dict[str, Any]:
        normalized = match_key(text)
        decorated_title = bool(TITLE_CATEGORY.match(text) or TITLE_SUFFIX.search(text))
        matches = [row for row in self.samples if (
            normalized in {
                title_key(row["title"]), match_key(row["title"]),
                match_key(row["text"]), match_key(row["title"] + " " + row["text"]),
            }
            or decorated_title and title_key(text) == title_key(row["title"])
        )]
        labels = {row["label"] for row in matches}
        scores = (self.matrix @ self.vectorizer.transform([normalized]).T).toarray().ravel()
        ranked = sorted(range(len(scores)), key=lambda index: scores[index], reverse=True)
        suggestions: list[dict[str, str]] = []
        titles: set[tuple[str, str]] = set()
        for index in ranked:
            row = self.samples[index]
            key = (title_key(row["title"]), row["label"])
            if scores[index] < 0.3:
                break
            if len(labels) == 1 and title_key(row["title"]) == title_key(matches[0]["title"]):
                continue
            if key not in titles:
                suggestions.append(row)
                titles.add(key)
            if len(suggestions) == 3:
                break
        if len(labels) == 1:
            return {"method": "match", "label": labels.pop(), "match": matches[0], "suggestions": suggestions, "classifier": None}
        signal = None
        if artifact is not None and len(normalized.split()) >= int(artifact.get("min_training_words", 0)):
            signal = predict_style(artifact, text)
        threshold = float((artifact or {}).get("decision_threshold", DEFAULT_DECISION_THRESHOLD))
        if not matches and signal is not None and signal["confidence"] >= threshold:
            return {"method": "prediction", "label": signal["label"], "match": None, "suggestions": suggestions, "classifier": signal}
        return {"method": "unresolved", "label": None, "match": None, "suggestions": suggestions, "classifier": signal}
