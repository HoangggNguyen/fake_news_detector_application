"""Chuyển bộ VFND gốc (github.com/thanhhocse96/vfnd-vietnamese-fake-news-datasets)
sang định dạng CSV mà ai-service dùng: id,title,text,domain,label (0=real, 1=fake).

Nguồn: CSV/vn_news_226_tlfr.csv (text,label) và CSV/vn_news_223_tdlfr.csv (text,domain,label).
Khử trùng nội dung sau chuẩn hóa, loại nội dung trùng nhưng khác nhãn, rồi chia
train/val/test phân tầng theo nhãn (mặc định 70/15/15, seed 42) để val/test độc lập với train.

Ví dụ:
    python -I ml/prepare_vfnd.py --source <thư mục repo VFND> --output apps/ai-service/vfnd_original
"""
from __future__ import annotations

import argparse
import csv
import random
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path


def norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text).casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True, help="Thư mục gốc của repo VFND đã clone")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val", type=float, default=0.15)
    parser.add_argument("--test", type=float, default=0.15)
    args = parser.parse_args()

    rows = read_csv(args.source / "CSV" / "vn_news_226_tlfr.csv")
    domains = {norm(r["text"]): r["domain"].strip() for r in read_csv(args.source / "CSV" / "vn_news_223_tdlfr.csv")}

    by_key: dict[str, dict[str, str]] = {}
    labels_by_key: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        text = unicodedata.normalize("NFC", row["text"]).strip()
        label = row["label"].strip()
        if not text or label not in {"0", "1"}:
            continue
        key = norm(text)
        labels_by_key[key].add(label)
        by_key.setdefault(key, {"text": text, "label": label})
    conflicts = [k for k, v in labels_by_key.items() if len(v) > 1]
    for key in conflicts:
        by_key.pop(key, None)

    samples = []
    for index, (key, item) in enumerate(sorted(by_key.items(), key=lambda kv: kv[1]["text"]), 1):
        lines = [line.strip() for line in item["text"].splitlines() if line.strip()]
        title = lines[0][:300] if lines else item["text"][:120]
        samples.append({
            "id": f"VFND_ORIG_{index:04d}",
            "title": title,
            "text": item["text"],
            "domain": domains.get(key) or "mang-xa-hoi",
            "label": item["label"],
        })

    rng = random.Random(args.seed)
    splits: dict[str, list[dict[str, str]]] = {"train": [], "val": [], "test": []}
    for label in ("0", "1"):
        group = [s for s in samples if s["label"] == label]
        rng.shuffle(group)
        n_val, n_test = round(len(group) * args.val), round(len(group) * args.test)
        splits["val"] += group[:n_val]
        splits["test"] += group[n_val:n_val + n_test]
        splits["train"] += group[n_val + n_test:]

    args.output.mkdir(parents=True, exist_ok=True)
    for name, items in splits.items():
        items.sort(key=lambda s: s["id"])
        with (args.output / f"{name}.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["id", "title", "text", "domain", "label"])
            writer.writeheader()
            writer.writerows(items)
        real = sum(s["label"] == "0" for s in items)
        print(f"{name}: {len(items)} mẫu ({real} thật / {len(items) - real} giả)")
    print(f"Tổng {len(samples)} mẫu duy nhất từ {len(rows)} dòng; loại {len(conflicts)} nội dung trùng khác nhãn.")


if __name__ == "__main__":
    main()
