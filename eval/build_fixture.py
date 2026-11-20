"""Build eval/data/crosssource_citation_check.jsonl from a CrossSource checkout.

Source: https://github.com/zoeb-nomi/crosssource (MIT), dataset v0.3,
data/v0.3/citation_check.jsonl (75 items, final adjudicated labels) and the
opinion texts in data/v0.3/corpus/. Chunk ids are positional, so the chunker
below is copied unchanged from crosssource/src/retrieval.py (chunk_text).

Each output row is self-contained: the claim, the cited chunk id, the five
context chunks with their text, the final label, and a fixed dev/test split.
The split is decided before any tuning: per label, items are sorted by
sha1(id) and the first third goes to dev. Thresholds in src/citations.ts are
tuned on dev only; the README reports test.

Usage: python3 -I eval/build_fixture.py /path/to/crosssource
"""

import hashlib
import json
import re
import sys
from pathlib import Path

TARGET_WORDS = 350
MAX_WORDS = 450


def chunk_text(text: str) -> list[str]:
    # Copied from crosssource/src/retrieval.py. Do not change: ids are positional.
    units = []
    for para in re.split(r"\n+", text):
        para = para.strip()
        if not para:
            continue
        words = para.split()
        if len(words) > MAX_WORDS:
            units.extend(" ".join(words[i : i + TARGET_WORDS]) for i in range(0, len(words), TARGET_WORDS))
        else:
            units.append(para)

    chunks, current, count = [], [], 0
    for unit in units:
        n = len(unit.split())
        if current and count + n > TARGET_WORDS:
            chunks.append("\n".join(current))
            current, count = [], 0
        current.append(unit)
        count += n
    if current:
        chunks.append("\n".join(current))
    return chunks


def main(root: Path) -> None:
    v3 = root / "data" / "v0.3"
    chunks = {}
    for path in sorted((v3 / "corpus").glob("*.txt")):
        for i, text in enumerate(chunk_text(path.read_text(encoding="utf-8"))):
            chunks[f"{path.stem}:{i}"] = text

    rows = [json.loads(l) for l in (v3 / "citation_check.jsonl").read_text().splitlines() if l.strip()]
    by_label: dict[str, list[dict]] = {}
    for r in rows:
        by_label.setdefault(r["label"], []).append(r)
    dev_ids = set()
    for label, items in by_label.items():
        items.sort(key=lambda r: hashlib.sha1(r["id"].encode()).hexdigest())
        dev_ids.update(r["id"] for r in items[: len(items) // 3])

    out = []
    for r in rows:
        ctx = list(dict.fromkeys(r["context_chunks"] + [r["cited_chunk"]]))
        missing = [c for c in ctx if c not in chunks]
        if missing:
            raise SystemExit(f"{r['id']}: chunk(s) not found {missing}")
        out.append({
            "id": r["id"],
            "split": "dev" if r["id"] in dev_ids else "test",
            "label": r["label"],
            "label_source": r.get("label_source"),
            "claim": r["claim"],
            "cited_chunk": r["cited_chunk"],
            "sources": [{"id": c, "text": chunks[c]} for c in ctx],
            "url": r["provenance"]["url"],
        })

    dest = Path(__file__).resolve().parent / "data" / "crosssource_citation_check.jsonl"
    dest.write_text("".join(json.dumps(o, ensure_ascii=False) + "\n" for o in out), encoding="utf-8")
    dev = sum(o["split"] == "dev" for o in out)
    print(f"wrote {len(out)} items ({dev} dev, {len(out) - dev} test) to {dest}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
