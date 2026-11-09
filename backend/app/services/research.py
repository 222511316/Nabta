"""Research use of growers' photos (charter §7, §8 "practical evaluation", §22.2).

Photos leave the app only through `export_research_set`, and only from growers whose research
consent is on (US22). `evaluate_collected` measures the installed model on such a set, with the
same rule as live analysis, and reports it apart from the IP102 benchmark.
"""

import csv
import re
import shutil
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Observation, Plant, User
from app.services.analysis import decide

MANIFEST = "manifest.csv"
COLUMNS = ["file", "category", "checked_by", "observed_on", "conditions", "nabta_result", "model_version"]
UNSUPPORTED = "unsupported"  # a specialist named an insect outside Nabta's categories
SPECIALIST_REVIEW = "specialist review in Nabta"
EXPORTED_FILE = re.compile(r"obs-\d+\.jpg")
SMALL_SAMPLE = 30


@dataclass(frozen=True)
class ExportSummary:
    photos: int
    growers: int
    checked: int
    unsupported: int


def _read_manifest(folder: Path) -> list[dict[str, str]]:
    path = folder / MANIFEST
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def _specialist_category(observation: Observation) -> str:
    """What a specialist identified in Nabta: a category key, UNSUPPORTED, or "" if nothing yet."""
    feedback = observation.review.feedback if observation.review else None
    if feedback is None or feedback.outcome != "identified":
        return ""
    return feedback.category_key or UNSUPPORTED


def export_research_set(db: Session, settings: Settings, out_dir: Path, include_unchecked: bool) -> ExportSummary:
    """Copies consenting growers' photos into out_dir with a manifest. No names, emails, notes or plants.

    Running it again brings the folder up to date: photos whose grower withdrew consent (or
    deleted them) are removed, and what the team typed into `conditions` or `category` is kept.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    previous = {row["file"]: row for row in _read_manifest(out_dir) if EXPORTED_FILE.fullmatch(row.get("file", ""))}
    observations = db.scalars(
        select(Observation)
        .join(Observation.plant)
        .join(Plant.owner)
        .where(User.research_consent.is_(True))
        .order_by(Observation.id)
    ).all()

    rows, growers = [], set()
    for observation in observations:
        name = f"obs-{observation.id}.jpg"
        before = previous.get(name, {})
        category, checked_by = _specialist_category(observation), SPECIALIST_REVIEW
        if not category:
            category, checked_by = before.get("category", ""), before.get("checked_by", "")
        if not category and not include_unchecked:
            continue
        source = settings.photos_dir / observation.photo_filename
        if not source.is_file():
            continue
        shutil.copyfile(source, out_dir / name)
        analysis = observation.analysis
        rows.append(
            {
                "file": name,
                "category": category,
                "checked_by": checked_by if category else "",
                "observed_on": observation.observed_on.isoformat(),
                "conditions": before.get("conditions", ""),
                "nabta_result": (analysis.category_key or "unclear") if analysis else "",
                "model_version": analysis.model_version if analysis else "",
            }
        )
        growers.add(observation.plant.owner_id)

    kept = {row["file"] for row in rows}
    for name in previous.keys() - kept:
        (out_dir / name).unlink(missing_ok=True)
    with (out_dir / MANIFEST).open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return ExportSummary(
        photos=len(rows),
        growers=len(growers),
        checked=sum(row["checked_by"] == SPECIALIST_REVIEW for row in rows),
        unsupported=sum(row["category"] == UNSUPPORTED for row in rows),
    )


@dataclass(frozen=True)
class _Result:
    true: str  # a category key or UNSUPPORTED
    top: str  # the model's most likely category
    identified: bool  # Nabta's rule accepted it
    conditions: str


def _percent(part: int, whole: int) -> str:
    return f"{part / whole:.1%} ({part} of {whole})" if whole else "–"


def evaluate_collected(classifier, set_dirs: list[Path], today: date) -> str:
    """A Markdown report of the model on labelled photos in set_dirs (each with a manifest.csv)."""
    keys = [category.key for category in classifier.categories]
    names = {category.key: category.name for category in classifier.categories}
    results: list[_Result] = []
    skipped: Counter[str] = Counter()
    labelled_by: Counter[str] = Counter()
    for folder in set_dirs:
        for row in _read_manifest(folder):
            category = row.get("category", "").strip()
            path = folder / row.get("file", "")
            if not category:
                skipped["no category yet"] += 1
            elif category != UNSUPPORTED and category not in keys:
                skipped[f"unknown category “{category}”"] += 1
            elif not path.is_file():
                skipped["photo file missing"] += 1
            else:
                with Image.open(path) as image:
                    decision = decide(classifier, classifier.predict(image.convert("RGB")))
                conditions = row.get("conditions", "").strip() or "not recorded"
                results.append(_Result(category, decision.ranked[0][0].key, decision.identified, conditions))
                labelled_by[row.get("checked_by", "").strip() or "not recorded"] += 1
    if not results:
        raise ValueError("No labelled photos to evaluate: fill in the category column of manifest.csv first.")

    supported = [r for r in results if r.true != UNSUPPORTED]
    unsupported = [r for r in results if r.true == UNSUPPORTED]
    accepted = [r for r in supported if r.identified]
    lines = [
        "# Nabta pest model: growers' photos",
        "",
        f"Generated by `python -m app.cli evaluate-collected` on {today.isoformat()}, with model "
        f"`{classifier.version}` and the same rule as the app. These photos come from growers who agreed to "
        "research use, plus any the team collected and labelled itself. They are reported separately from "
        "the IP102 benchmark in [evaluation.md](evaluation.md) (charter §8).",
        "",
        "## Samples",
        "",
        "| Category | Photos |",
        "| --- | ---: |",
    ]
    true_counts = Counter(r.true for r in results)
    lines += [f"| {names[key]} | {true_counts[key]} |" for key in keys if true_counts[key]]
    if unsupported:
        lines.append(f"| Insects outside Nabta's categories | {len(unsupported)} |")
    lines += [f"| **Total** | **{len(results)}** |", ""]
    lines.append("Labels checked by: " + "; ".join(f"{who} ({n})" for who, n in labelled_by.most_common()) + ".")
    if skipped:
        lines.append("Not evaluated: " + "; ".join(f"{why} ({n})" for why, n in skipped.most_common()) + ".")

    lines += [
        "",
        "## With Nabta's rule",
        "",
        "| Measure | Result |",
        "| --- | ---: |",
        f"| Supported insects accepted | {_percent(len(accepted), len(supported))} |",
        f"| Accuracy of accepted results | {_percent(sum(r.top == r.true for r in accepted), len(accepted))} |",
        f"| Insects outside Nabta's categories shown as unclear | "
        f"{_percent(sum(not r.identified for r in unsupported), len(unsupported))} |",
        "",
        "## Collection conditions",
        "",
        "| Conditions | Photos | Top category right | Supported accepted | Outside categories rejected |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for conditions in sorted({r.conditions for r in results}):
        group = [r for r in results if r.conditions == conditions]
        group_supported = [r for r in group if r.true != UNSUPPORTED]
        group_unsupported = [r for r in group if r.true == UNSUPPORTED]
        lines.append(
            f"| {conditions} | {len(group)} "
            f"| {_percent(sum(r.top == r.true for r in group_supported), len(group_supported))} "
            f"| {_percent(sum(r.identified for r in group_supported), len(group_supported))} "
            f"| {_percent(sum(not r.identified for r in group_unsupported), len(group_unsupported))} |"
        )

    if supported:
        present = [key for key in keys if true_counts[key]]
        lines += [
            "",
            "## Per category (top category, supported insects)",
            "",
            "| Category | Precision | Recall | F1 | Photos |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
        f1s = []
        for key in present:
            hits = sum(r.top == key and r.true == key for r in supported)
            predicted = sum(r.top == key for r in supported)
            precision = hits / predicted if predicted else 0.0
            recall = hits / true_counts[key]
            f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
            f1s.append(f1)
            lines.append(f"| {names[key]} | {precision:.3f} | {recall:.3f} | {f1:.3f} | {true_counts[key]} |")
        lines += [
            "",
            f"Macro F1 over the {len(present)} categories with photos: **{sum(f1s) / len(f1s):.3f}** "
            "(the benchmark's is in evaluation.md).",
            "",
            "## Confusion matrix",
            "",
            "Rows are the checked category and columns the model's top category.",
            "",
            "| True \\ predicted | " + " | ".join(names[key] for key in keys) + " |",
            "| --- |" + " ---: |" * len(keys),
        ]
        for true in present:
            cells = [str(sum(r.true == true and r.top == key for r in supported)) for key in keys]
            lines.append(f"| {names[true]} | " + " | ".join(cells) + " |")

    lines += ["", "## Limits", ""]
    small = [names[key] for key in keys if 0 < true_counts[key] < SMALL_SAMPLE]
    if small:
        lines.append(
            f"- Fewer than {SMALL_SAMPLE} photos for: {', '.join(small)}. One photo more or less can move "
            "these numbers a lot, so read them as indicative."
        )
    lines.append("- Labels are only as good as the check behind them; the `checked_by` column records who checked each.")
    return "\n".join(lines) + "\n"
