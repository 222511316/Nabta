"""Step 2: audit the extracted images (charter R01, R09).

    python -m nabta_ml.audit

Writes ml/reports/audit.md, a contact sheet per category for the visual label check, and
ml/reports/excluded.json listing test images removed because they duplicate a training image.
"""

import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

from nabta_ml import config
from nabta_ml.categories import load_categories
from nabta_ml.dataset import read_index
from nabta_ml.dedupe import cross_split_duplicates, dhash

THUMB = 150
PER_CLASS = 8
TINY = 100  # shorter side below this is reported as tiny


def contact_sheet(entries: list[dict], class_ids: list[int], title: str, out: Path) -> None:
    rows = []
    for class_id in class_ids:
        pool = [e for e in entries if e["label"] == class_id - 1 and e["split"] == "train"]
        rows.append((class_id, random.Random(class_id).sample(pool, min(PER_CLASS, len(pool)))))
    label_width = 70
    sheet = Image.new("RGB", (label_width + PER_CLASS * THUMB, 34 + len(rows) * THUMB), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 10), title, fill=(20, 40, 25))
    for row_index, (class_id, picks) in enumerate(rows):
        y = 34 + row_index * THUMB
        draw.text((8, y + THUMB // 2 - 6), f"#{class_id}", fill=(20, 40, 25))
        for col, entry in enumerate(picks):
            with Image.open(config.SUBSET_DIR / entry["path"]) as image:
                thumb = image.convert("RGB")
                thumb.thumbnail((THUMB - 6, THUMB - 6))
            sheet.paste(thumb, (label_width + col * THUMB + 3, y + 3))
    sheet.save(out, quality=85)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    mapping = load_categories(config.CATEGORIES_FILE)
    entries = [e for e in read_index(config.SUBSET_DIR) if not e["skipped"]]
    supported = [e for e in entries if e["role"] == "supported"]
    out_dir = config.REPORTS_DIR / "audit"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Visual label check: one sheet per category, one row per IP102 class.
    for category in mapping.categories:
        contact_sheet(
            supported, list(category.ip102_ids), f"{category.name}: IP102 classes {category.ip102_ids}",
            out_dir / f"{category.key}.jpg",
        )

    # Near-duplicates across splits, within the supported images.
    hashes = {}
    for entry in supported:
        with Image.open(config.SUBSET_DIR / entry["path"]) as image:
            hashes[(entry["split"], entry["index"])] = dhash(image)
    pairs = cross_split_duplicates(hashes, max_distance=4)
    # A leak means an evaluation image (validation or test) also appears in training,
    # or a test image also appears in validation. Drop the later-split copy.
    excluded = sorted({b for a, b in pairs}, key=lambda k: (k[0], k[1]))
    (config.REPORTS_DIR / "excluded.json").write_text(
        json.dumps({"reason": "near-duplicate of an image in an earlier split (dHash ≤ 4 bits)",
                    "images": [{"split": s, "index": i} for s, i in excluded]}, indent=2),
        encoding="utf-8",
    )

    counts = defaultdict(Counter)
    tiny = Counter()
    for entry in supported:
        counts[entry["category"]][entry["split"]] += 1
        if min(entry["width"], entry["height"]) < TINY:
            tiny[entry["category"]] += 1
    excluded_by_category = Counter(
        next(e["category"] for e in supported if (e["split"], e["index"]) == key) for key in excluded
    )
    pair_splits = Counter(f"{a[0]}→{b[0]}" for a, b in pairs)

    lines = [
        "# Dataset audit",
        "",
        f"Source: {config.DATASET_SOURCE['name']} ({config.DATASET_SOURCE['citation']}), "
        f"obtained from {config.DATASET_SOURCE['obtained_from']}. {config.DATASET_SOURCE['why_mirror']}",
        "",
        "## Images per category",
        "",
        "| Category | Train | Validation | Test | Shorter side < 100 px | Removed as duplicates |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for index, category in enumerate(mapping.categories):
        c = counts[index]
        lines.append(
            f"| {category.name} | {c['train']} | {c['validation']} | {c['test']} | {tiny[index]} | {excluded_by_category[index]} |"
        )
    largest = max(counts[i]["train"] for i in range(len(mapping.categories)))
    smallest = min(counts[i]["train"] for i in range(len(mapping.categories)))
    lines += [
        "",
        f"Training images per category range from {smallest} to {largest} (imbalance {largest / smallest:.1f}×), "
        "so training uses class-balanced weights.",
        "",
        "## Near-duplicates across splits (R09)",
        "",
        f"{len(pairs)} near-duplicate pairs cross splits ({', '.join(f'{k}: {v}' for k, v in sorted(pair_splits.items())) or 'none'}). "
        f"The later-split copy of each ({len(excluded)} images, all in validation or test) is excluded from validation and test, so no evaluation image also appears in training; see `excluded.json`.",
        "",
        "## Visual label check",
        "",
        "Contact sheets of 8 random training images per IP102 class are in `audit/`; "
        "the review and the noise it found are in `label-check.md`.",
        "",
    ]
    (config.REPORTS_DIR / "audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
