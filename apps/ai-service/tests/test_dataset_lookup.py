import csv

from app.dataset_lookup import DatasetLookup


def write_samples(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["id", "title", "text", "domain", "label"])
        writer.writeheader()
        writer.writerows(rows)


def test_title_match_and_related_but_not_identical_input(tmp_path):
    path = tmp_path / "train.csv"
    write_samples(path, [
        {"id": "1", "title": "Chính Phủ - Ban hành Nghị định mới về quản lý đất đai (Mẫu #991)",
         "text": "Một văn bản giả lập.", "domain": "Chính phủ", "label": "0"},
        {"id": "2", "title": "Hủy bỏ Nghị định về quản lý đất đai (Mẫu #2)",
         "text": "Một tin giả lập.", "domain": "Diễn đàn", "label": "1"},
    ])
    lookup = DatasetLookup([path])
    match = lookup.classify("Ban hành Nghị định mới về quản lý đất đai", None)
    assert match["label"] == "real"
    assert match["match"]["id"] == "1"
    related = lookup.classify("Không ban hành Nghị định mới về quản lý đất đai", None)
    assert related["label"] is None
    assert related["suggestions"]
    unrelated = lookup.classify("Thời tiết trên sao Hỏa hôm nay", None)
    assert unrelated["label"] is None
    assert not unrelated["suggestions"]


def test_conflicting_labels_do_not_produce_a_verdict(tmp_path):
    path = tmp_path / "train.csv"
    write_samples(path, [
        {"id": "1", "title": "Một bản tin ví dụ", "text": "Nội dung một", "domain": "A", "label": "0"},
        {"id": "2", "title": "Một bản tin ví dụ", "text": "Nội dung hai", "domain": "B", "label": "1"},
    ])
    result = DatasetLookup([path]).classify("Một bản tin ví dụ", None)
    assert result["label"] is None
    assert result["match"] is None


def test_different_numbers_do_not_match(tmp_path):
    path = tmp_path / "train.csv"
    write_samples(path, [
        {"id": "1", "title": "Ban hành nghị định 102 năm 2024", "text": "Một văn bản.",
         "domain": "Nguồn giả lập", "label": "0"},
    ])
    lookup = DatasetLookup([path])
    assert lookup.classify("Ban hành nghị định 102 năm 2024", None)["label"] == "real"
    assert lookup.classify("Ban hành nghị định 103 năm 2025", None)["label"] is None


def test_classifier_threshold_and_conflict_handling(tmp_path, monkeypatch):
    path = tmp_path / "train.csv"
    write_samples(path, [
        {"id": "1", "title": "Bản tin ví dụ", "text": "Nội dung một", "domain": "A", "label": "0"},
        {"id": "2", "title": "Bản tin ví dụ", "text": "Nội dung hai", "domain": "B", "label": "1"},
    ])
    lookup = DatasetLookup([path])
    artifact = {"min_training_words": 1}
    monkeypatch.setattr("app.dataset_lookup.predict_style", lambda artifact, text: {"label": "fake", "confidence": 0.9})
    assert lookup.classify("Nội dung khác hoàn toàn", artifact)["method"] == "prediction"
    assert lookup.classify("Bản tin ví dụ", artifact)["method"] == "unresolved"
    monkeypatch.setattr("app.dataset_lookup.predict_style", lambda artifact, text: {"label": "fake", "confidence": 0.89})
    assert lookup.classify("Nội dung khác hoàn toàn", artifact)["method"] == "unresolved"
