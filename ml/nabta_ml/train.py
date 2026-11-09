"""Step 4: train a head on each backbone's features, calibrate it, set the "unclear" rule and
evaluate on the fixed test split (charter §8, §22.2).

    python -m nabta_ml.train

Nabta's rule: a photo is identified only when it is familiar (close enough to at least one
training photo) and its top category is more likely than not. Anything else is "unclear".
The familiarity cut-off is chosen on validation.

Writes ml/reports/evaluation.md and evaluation.json, the chosen model's confusion matrix, and
its head and reference features to ml/artifacts/ for step 5 (export).
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

import numpy as np
from sklearn.metrics import roc_auc_score

from nabta_ml import config
from nabta_ml.categories import load_categories
from nabta_ml.dataset import read_index
from nabta_ml.head import (
    choose_familiarity_threshold,
    choose_threshold,
    familiarity,
    fit_head,
    fit_temperature,
    l2_normalize,
    softmax,
)
from nabta_ml.metrics import acceptance_report, classification_report, expected_calibration_error, open_set_report
from nabta_ml.report import write_report

STRENGTHS = (0.3, 1.0, 3.0, 10.0, 30.0, 100.0)
# Fixed in advance, not tuned: an identified result must be more likely than not.
MIN_CONFIDENCE = 0.5
# The charter's "initial baseline" (§8): a standard torchvision model, trained the same way.
BASELINE = "resnet50"
FEATURE_DIMS = {"bioclip": 512, "resnet50": 2048}


@dataclass
class Group:
    x: np.ndarray
    y: np.ndarray  # Nabta category index; -1 for unsupported insects
    keys: list


def excluded_images() -> set[tuple[str, int]]:
    """Validation and test images that duplicate an earlier split's image (audit, R09)."""
    raw = json.loads((config.REPORTS_DIR / "excluded.json").read_text(encoding="utf-8"))
    return {(item["split"], item["index"]) for item in raw["images"]}


def load_groups(backbone: str, entries: list[dict], excluded: set) -> tuple[str, dict[str, Group]]:
    """Cached features, grouped as: train (plus its augmented view), validation and test of
    the supported categories, and the two groups of unsupported insects."""
    folder = config.FEATURES_DIR / backbone
    rows = json.loads((folder / "rows.json").read_text(encoding="utf-8"))
    plain = np.load(folder / "plain.npy")
    position = {tuple(key): i for i, key in enumerate(rows["plain"])}

    members = defaultdict(list)
    for entry in entries:
        key = (entry["split"], entry["index"])
        if key in excluded or key not in position:
            continue
        group = entry["split"] if entry["role"] == "supported" else entry["role"]
        members[group].append((key, entry["category"] if entry["role"] == "supported" else -1))

    groups = {
        name: Group(plain[[position[k] for k, _ in items]], np.array([c for _, c in items]), [k for k, _ in items])
        for name, items in members.items()
    }
    groups["train_fit"] = groups["train"]
    if rows["augmented_train"]:
        augmented = np.load(folder / "augmented_train.npy")
        category = {(e["split"], e["index"]): e["category"] for e in entries}
        extra = [tuple(key) for key in rows["augmented_train"]]
        groups["train_fit"] = Group(
            np.concatenate([groups["train"].x, augmented]),
            np.concatenate([groups["train"].y, [category[key] for key in extra]]),
            groups["train"].keys + extra,
        )
    return rows["backbone"], groups


class Scorer:
    """A trained head with its calibration and reference photos: probabilities and familiarity."""

    def __init__(self, head, temperature: float, reference: np.ndarray):
        self.head, self.temperature, self.reference = head, temperature, reference

    def probabilities(self, x: np.ndarray) -> np.ndarray:
        return softmax(self.head.predict_logits(x), self.temperature)

    def familiarity(self, x: np.ndarray) -> np.ndarray:
        return familiarity(x, self.reference)


def auroc(known: np.ndarray, unknown: np.ndarray) -> float:
    """How well a score ranks supported insects above unsupported ones (0.5 = chance)."""
    labels = np.r_[np.ones(len(known)), np.zeros(len(unknown))]
    return float(roc_auc_score(labels, np.r_[known, unknown]))


def train_and_evaluate(backbone: str, description: str, groups: dict[str, Group], names: list[str]) -> dict:
    started = time.time()
    fit, val, test = groups["train_fit"], groups["validation"], groups["test"]
    tuning, held_out = groups["unsupported_tuning"], groups["unsupported_held_out"]
    head = fit_head(fit.x, fit.y, val.x, val.y, STRENGTHS, config.SEED)
    temperature = fit_temperature(head.predict_logits(val.x), val.y)
    scorer = Scorer(head, temperature, l2_normalize(groups["train"].x))

    def measure(group: Group) -> dict:
        probabilities = scorer.probabilities(group.x)
        return {
            "confidence": probabilities.max(axis=1),
            "predicted": probabilities.argmax(axis=1),
            "familiarity": scorer.familiarity(group.x),
            "max_logit": head.predict_logits(group.x).max(axis=1),
        }

    m = {name: measure(group) for name, group in (("val", val), ("test", test), ("tuning", tuning), ("held_out", held_out))}
    threshold = choose_familiarity_threshold(
        m["val"]["familiarity"], m["val"]["confidence"], m["tuning"]["familiarity"], m["tuning"]["confidence"], MIN_CONFIDENCE
    )

    def accepted(name: str) -> np.ndarray:
        return (m[name]["familiarity"] >= threshold) & (m[name]["confidence"] >= MIN_CONFIDENCE)

    # For comparison: the simpler rule that looks at confidence only.
    confidence_only = choose_threshold(m["val"]["confidence"], m["tuning"]["confidence"])
    return {
        "backbone": backbone,
        "description": description,
        "feature_dim": FEATURE_DIMS[backbone],
        "strength": head.strength,
        "validation_macro_f1_by_strength": {str(s): f for s, f in head.validation_macro_f1.items()},
        "validation_macro_f1": head.validation_macro_f1[head.strength],
        "temperature": temperature,
        "min_confidence": MIN_CONFIDENCE,
        "familiarity_threshold": threshold,
        "test": classification_report(test.y, m["test"]["predicted"], names),
        "uncertainty": {
            "validation": acceptance_report(accepted("val"), m["val"]["predicted"] == val.y, accepted("tuning")),
            "test": acceptance_report(accepted("test"), m["test"]["predicted"] == test.y, accepted("held_out")),
        },
        "confidence_only": {
            "validation": open_set_report(
                m["val"]["confidence"], m["val"]["predicted"] == val.y, m["tuning"]["confidence"], confidence_only
            ),
            "test": open_set_report(
                m["test"]["confidence"], m["test"]["predicted"] == test.y, m["held_out"]["confidence"], confidence_only
            ),
        },
        "open_set_scores": {
            score: {
                "validation_auroc": auroc(m["val"][key], m["tuning"][key]),
                "test_auroc": auroc(m["test"][key], m["held_out"][key]),
            }
            for score, key in (
                ("Top probability", "confidence"),
                ("Top logit", "max_logit"),
                ("Similarity to the nearest training photo", "familiarity"),
            )
        },
        "calibration": {
            "test_ece_before": expected_calibration_error(softmax(head.predict_logits(test.x)), test.y),
            "test_ece_after": expected_calibration_error(scorer.probabilities(test.x), test.y),
        },
        "train_seconds": round(time.time() - started, 1),
        "_scorer": scorer,
    }


def zero_shot(groups: dict[str, Group], keys: list[str], names: list[str]) -> dict:
    from nabta_ml import zeroshot

    predicted = zeroshot.predict(groups["test"].x, zeroshot.text_embeddings(keys))
    return {
        "prompts": {key: [zeroshot.TEMPLATE.format(p) for p in zeroshot.PROMPTS[key]] for key in keys},
        "test": classification_report(groups["test"].y, predicted, names),
    }


def unsuitable_photos(result: dict, entries: list[dict], groups: dict[str, Group], count: int) -> dict:
    """How often the chosen model says "unclear" for photos a grower shouldn't rely on:
    test photos made very blurry, or very dark (charter §22.2)."""
    import torch
    from PIL import Image, ImageEnhance, ImageFilter

    from nabta_ml.backbones import load_backbone

    backbone = load_backbone(result["backbone"])
    transform = backbone.preprocess.eval_transform()
    paths = {(e["split"], e["index"]): e["path"] for e in entries}
    rng = np.random.default_rng(config.SEED)
    sample = [groups["test"].keys[i] for i in rng.choice(len(groups["test"].keys), size=count, replace=False)]
    damage = {
        "blurred": lambda image: image.filter(ImageFilter.GaussianBlur(radius=12)),
        "dark": lambda image: ImageEnhance.Brightness(image).enhance(0.12),
    }
    scorer = result["_scorer"]
    outcome = {}
    for name, change in damage.items():
        batch = []
        for key in sample:
            with Image.open(config.SUBSET_DIR / paths[key]) as image:
                batch.append(transform(change(image.convert("RGB"))))
        with torch.inference_mode():
            features = torch.cat([backbone.encoder(torch.stack(batch[i : i + 32])) for i in range(0, count, 32)])
        features = features.float().numpy()
        accepted = (scorer.familiarity(features) >= result["familiarity_threshold"]) & (
            scorer.probabilities(features).max(axis=1) >= result["min_confidence"]
        )
        outcome[name] = {"images": count, "rejected": float(1 - np.mean(accepted))}
    return outcome


def counts(entries: list[dict], groups: dict[str, Group], excluded: set) -> dict:
    classes = defaultdict(set)
    for entry in entries:
        if entry["role"] != "supported":
            classes[entry["role"]].add(entry["label"])
    return {
        "train": len(groups["train"].y),
        "train_augmented_views": len(groups["train_fit"].y) - len(groups["train"].y),
        "validation": len(groups["validation"].y),
        "test": len(groups["test"].y),
        "unsupported_tuning": len(groups["unsupported_tuning"].y),
        "unsupported_tuning_classes": len(classes["unsupported_tuning"]),
        "unsupported_held_out": len(groups["unsupported_held_out"].y),
        "unsupported_held_out_classes": len(classes["unsupported_held_out"]),
        "duplicates_excluded": len(excluded),
    }


def official_baseline() -> dict | None:
    """The published IP102 ResNet-50's results, from python -m nabta_ml.official, if run."""
    path = config.REPORTS_DIR / "official_baseline.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def save_head(result: dict) -> None:
    """Everything export needs besides the backbone: the head, calibration, rule and references."""
    config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    scorer = result["_scorer"]
    np.savez(
        config.ARTIFACTS_DIR / f"{result['backbone']}-head.npz",
        weights=scorer.head.weights.astype(np.float32),
        bias=scorer.head.bias.astype(np.float32),
        temperature=np.float32(result["temperature"]),
        min_confidence=np.float32(result["min_confidence"]),
        familiarity_threshold=np.float32(result["familiarity_threshold"]),
        reference=scorer.reference.astype(np.float32),
    )


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--unsuitable", type=int, default=200, help="photos per unsuitable-photo check (0 skips)")
    args = parser.parse_args()

    mapping = load_categories(config.CATEGORIES_FILE)
    names = [category.name for category in mapping.categories]
    entries = [e for e in read_index(config.SUBSET_DIR) if not e["skipped"]]
    excluded = excluded_images()

    results, groups_by_backbone = {}, {}
    for backbone in ("bioclip", "resnet50"):
        if not (config.FEATURES_DIR / backbone / "plain.npy").is_file():
            print(f"{backbone}: no features yet (run nabta_ml.features); skipped")
            continue
        description, groups = load_groups(backbone, entries, excluded)
        print(f"{backbone}: training on {len(groups['train_fit'].y)} feature vectors…", flush=True)
        results[backbone] = train_and_evaluate(backbone, description, groups, names)
        groups_by_backbone[backbone] = groups
        r = results[backbone]
        print(
            f"  C={r['strength']}  validation macro F1 {r['validation_macro_f1']:.3f}  "
            f"test macro F1 {r['test']['macro_f1']:.3f}  familiarity cut-off {r['familiarity_threshold']:.3f}"
        )
    if not results:
        raise SystemExit("No features found. Run python -m nabta_ml.features first.")

    # The choice is made on validation only; size breaks a tie (charter §18).
    chosen = max(results.values(), key=lambda r: (round(r["validation_macro_f1"], 3), -r["feature_dim"]))
    print(f"Chosen: {chosen['backbone']}")

    zero = None
    if "bioclip" in groups_by_backbone:
        print("BioCLIP zero-shot baseline…", flush=True)
        zero = zero_shot(groups_by_backbone["bioclip"], mapping.keys, names)
        print(f"  test macro F1 {zero['test']['macro_f1']:.3f}")

    unsuitable = None
    if args.unsuitable:
        print("Unsuitable-photo check…", flush=True)
        unsuitable = unsuitable_photos(chosen, entries, groups_by_backbone[chosen["backbone"]], args.unsuitable)
        print(f"  {unsuitable}")

    save_head(chosen)
    summary = {
        "date": date.today().isoformat(),
        "dataset": config.DATASET_SOURCE,
        "categories": [{"key": c.key, "name": c.name, "ip102": list(c.ip102_ids)} for c in mapping.categories],
        "counts": counts(entries, groups_by_backbone[chosen["backbone"]], excluded),
        "chosen": chosen["backbone"],
        "baseline": BASELINE if BASELINE in results else None,
        "models": {name: {k: v for k, v in r.items() if not k.startswith("_")} for name, r in results.items()},
        "zero_shot": zero,
        "unsuitable_photos": unsuitable,
        "official_ip102_baseline": official_baseline(),
        "seed": config.SEED,
    }
    (config.REPORTS_DIR / "evaluation.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    write_report(summary, names)
    print(f"Wrote {config.REPORTS_DIR / 'evaluation.md'}")


if __name__ == "__main__":
    main()
