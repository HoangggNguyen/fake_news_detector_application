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
    assert [row["id"] for row in match["suggestions"]] == ["2"]
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


def test_finance_dataset_returns_complete_text_and_source_url():
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "finance_data" / "train.csv"
    lookup = DatasetLookup([path])
    cases = [
        ("giá vàng trong nước", "FIN_001"),
        ("giá xăng dầu", "FIN_002"),
        ("tỷ giá ngoại tệ", "FIN_003"),
        ("thị trường chứng khoán", "FIN_004"),
    ]
    for query, expected_id in cases:
        result = lookup.classify(query, None)
        assert result["method"] == "unresolved"
        sample = next(row for row in result["suggestions"] if row["id"] == expected_id)
        assert len(sample["text"]) > 100
        assert sample["source_url"].startswith("https://")


def test_new_dataset_titles_and_duplicates(tmp_path):
    path = tmp_path / "train.csv"
    write_samples(path, [
        {"id": "1", "title": "[Kinh tế - Năng lượng] Giá xăng tăng 500 đồng - kỳ điều hành (Cập nhật đợt #1)",
         "text": "Giá xăng tăng 500 đồng.", "domain": "Nguồn A", "label": "0"},
        {"id": "2", "title": "[Kinh tế - Năng lượng] Giá xăng tăng 500 đồng - kỳ điều hành (Cập nhật đợt #42)",
         "text": "Giá xăng tăng 500 đồng.", "domain": "Nguồn A", "label": "0"},
        {"id": "3", "title": "[Tin lá cải] Giá xăng giảm 500 đồng (Cảnh báo mẫu #4)",
         "text": "Tin đồn về giá xăng.", "domain": "Nguồn B", "label": "1"},
    ])
    lookup = DatasetLookup([path])
    assert len(lookup.samples) == 2
    title = "Giá xăng tăng 500 đồng - kỳ điều hành"
    assert lookup.classify(title, None)["label"] == "real"
    assert lookup.classify(f"[Kinh tế - Năng lượng] {title} (Cập nhật đợt #42)", None)["label"] == "real"
    assert lookup.classify("[Tin lá cải] Giá xăng giảm 500 đồng (Cảnh báo mẫu #99)", None)["label"] == "fake"
    assert lookup.classify("Giá xăng tăng 501 đồng - kỳ điều hành", None)["label"] is None
    assert lookup.classify("Không " + title, None)["label"] is None
    related = lookup.classify("giá xăng", None)
    assert related["label"] is None
    assert len({row["id"] for row in related["suggestions"]}) == len(related["suggestions"])


def test_new_dataset_conflicting_decorated_titles_are_unresolved(tmp_path):
    path = tmp_path / "train.csv"
    write_samples(path, [
        {"id": "1", "title": "[Tin tức] Một bản tin (Cập nhật đợt #1)",
         "text": "Nội dung tin.", "domain": "Nguồn A", "label": "0"},
        {"id": "2", "title": "[Tin tức] Một bản tin (Cập nhật đợt #2)",
         "text": "Nội dung tin.", "domain": "Nguồn B", "label": "1"},
    ])
    lookup = DatasetLookup([path])
    assert lookup.classify("[Tin tức] Một bản tin (Cập nhật đợt #99)", None)["label"] is None
    assert lookup.classify("Một bản tin", None)["label"] is None
