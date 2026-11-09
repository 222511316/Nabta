"""Step 1: extract the images Nabta uses from IP102.

    python -m nabta_ml.prepare
"""

import json
import time
from collections import Counter

from nabta_ml import config
from nabta_ml.categories import load_categories, split_unsupported
from nabta_ml.dataset import SPLITS, SelectionPlan, extract, read_rows, select_rows, write_index


def main() -> None:
    started = time.time()
    mapping = load_categories(config.CATEGORIES_FILE)
    tuning, held_out = split_unsupported(mapping.unsupported_labels, mapping.unsupported_split_seed)
    plan = SelectionPlan(
        supported_labels=frozenset(label for c in mapping.categories for label in c.labels),
        tuning_labels=frozenset(tuning),
        held_out_labels=frozenset(held_out),
        held_out_sample=config.HELD_OUT_SAMPLE,
        seed=config.SEED,
    )

    rows = read_rows(config.RAW_DIR)
    counts = {split: sum(1 for r in rows if r.split == split) for split in SPLITS}
    if counts != config.DATASET_SOURCE["split_sizes"]:
        raise SystemExit(f"Split sizes {counts} do not match IP102's {config.DATASET_SOURCE['split_sizes']}")

    selected = select_rows(rows, plan)
    print(f"Selected {len(selected)} of {len(rows)} images; extracting to {config.SUBSET_DIR} ...")
    entries = extract(config.RAW_DIR, config.SUBSET_DIR, selected, mapping.category_of_label)
    write_index(config.SUBSET_DIR, entries)

    summary = Counter((e["role"], e["split"]) for e in entries if not e["skipped"])
    skipped = sum(1 for e in entries if e["skipped"])
    config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (config.REPORTS_DIR / "subset.json").write_text(
        json.dumps(
            {
                "dataset": config.DATASET_SOURCE,
                "categories": {c.key: list(c.ip102_ids) for c in mapping.categories},
                "unsupported_tuning_classes": [label + 1 for label in tuning],
                "unsupported_held_out_classes": [label + 1 for label in held_out],
                "held_out_sample": config.HELD_OUT_SAMPLE,
                "seed": config.SEED,
                "images": {f"{role}/{split}": n for (role, split), n in sorted(summary.items())},
                "skipped_unreadable": skipped,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    for (role, split), n in sorted(summary.items()):
        print(f"  {role:22} {split:10} {n:>6}")
    print(f"Skipped (unreadable): {skipped}. Done in {time.time() - started:.0f}s.")


if __name__ == "__main__":
    main()
