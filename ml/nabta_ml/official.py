"""The IP102 authors' published ResNet-50 (Wu et al., CVPR 2019; resnet50_0.497.pkl), evaluated
on Nabta's categories and the same deduplicated test split as Nabta's own models.

    python -m nabta_ml.official [--weights path/to/resnet50_0.497.pkl]

The model predicts all 102 IP102 classes. Two readings are reported:
  restricted    the best of the classes in Nabta's categories, i.e. the same 8-way task
  unrestricted  its overall best class; naming a class outside Nabta's categories is wrong
Its training preprocessing isn't published, so the two standard choices are compared on a
validation sample and the better one is used on test (the baseline is not handicapped).

Writes ml/reports/official_baseline.json, which the evaluation report includes.
"""

import argparse
import hashlib
import json
import sys
import time

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

from nabta_ml import config
from nabta_ml.backbones import IMAGENET_MEAN, IMAGENET_STD
from nabta_ml.categories import IP102_CLASS_COUNT, load_categories
from nabta_ml.dataset import read_index
from nabta_ml.metrics import classification_report

DEFAULT_WEIGHTS = config.ML_DIR / "resnet50_0.497.pkl"
PREPROCESSING = {
    "resize 256, centre crop 224": transforms.Compose(
        [transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(), transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)]
    ),
    "resize to 224 × 224": transforms.Compose(
        [transforms.Resize((224, 224)), transforms.ToTensor(), transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)]
    ),
}
VALIDATION_SAMPLE = 600


def load_official(path) -> torch.nn.Module:
    """The published weights are a plain state dict; weights_only refuses anything that isn't."""
    state = torch.load(path, map_location="cpu", weights_only=True)
    state = {key.removeprefix("module."): value for key, value in state.items()}
    model = models.resnet50(num_classes=IP102_CLASS_COUNT)
    model.load_state_dict(state)
    return model.eval()


class Photos(Dataset):
    def __init__(self, entries, transform):
        self.entries, self.transform = entries, transform

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, i):
        with Image.open(config.SUBSET_DIR / self.entries[i]["path"]) as image:
            return self.transform(image.convert("RGB"))


def logits_for(model, entries, transform, label: str) -> np.ndarray:
    chunks, started = [], time.time()
    with torch.inference_mode():
        for batch in DataLoader(Photos(entries, transform), batch_size=64, num_workers=4):
            chunks.append(model(batch).numpy())
            done = sum(len(c) for c in chunks)
            print(f"\r  {label}: {done}/{len(entries)} images, {done / (time.time() - started):.1f}/s", end="", flush=True)
    print()
    return np.concatenate(chunks)


def to_categories(logits: np.ndarray, mapping) -> tuple[np.ndarray, np.ndarray]:
    """IP102-class logits → (restricted, unrestricted) Nabta category predictions; -1 = outside."""
    category_of = np.array([-1 if (c := mapping.category_of_label(label)) is None else c for label in range(IP102_CLASS_COUNT)])
    supported = category_of >= 0
    restricted = category_of[np.where(supported, logits, -np.inf).argmax(axis=1)]
    unrestricted = category_of[logits.argmax(axis=1)]
    return restricted, unrestricted


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", default=str(DEFAULT_WEIGHTS))
    parser.add_argument("--limit", type=int, default=0, help="only the first N test images (speed check)")
    args = parser.parse_args()

    torch.manual_seed(config.SEED)
    mapping = load_categories(config.CATEGORIES_FILE)
    names = [category.name for category in mapping.categories]
    excluded = json.loads((config.REPORTS_DIR / "excluded.json").read_text(encoding="utf-8"))
    excluded = {(item["split"], item["index"]) for item in excluded["images"]}
    supported = [
        e for e in read_index(config.SUBSET_DIR)
        if not e["skipped"] and e["role"] == "supported" and (e["split"], e["index"]) not in excluded
    ]
    validation = [e for e in supported if e["split"] == "validation"]
    test = [e for e in supported if e["split"] == "test"]
    rng = np.random.default_rng(config.SEED)
    sample = [validation[i] for i in sorted(rng.choice(len(validation), size=min(VALIDATION_SAMPLE, len(validation)), replace=False))]
    if args.limit:
        sample, test = sample[: args.limit], test[: args.limit]

    model = load_official(args.weights)
    sample_truth = np.array([e["category"] for e in sample])
    choice = {}
    for name, transform in PREPROCESSING.items():
        restricted, _ = to_categories(logits_for(model, sample, transform, f"validation sample, {name}"), mapping)
        choice[name] = classification_report(sample_truth, restricted, names)["macro_f1"]
        print(f"  {name}: validation-sample macro F1 {choice[name]:.3f}")
    preprocessing = max(choice, key=choice.get)

    truth = np.array([e["category"] for e in test])
    restricted, unrestricted = to_categories(logits_for(model, test, PREPROCESSING[preprocessing], "test"), mapping)
    result = {
        "model": "IP102 ResNet-50 published by the dataset authors (resnet50_0.497.pkl), trained on IP102 train",
        "weights_sha256": hashlib.sha256(open(args.weights, "rb").read()).hexdigest(),
        "preprocessing": preprocessing,
        "preprocessing_validation_macro_f1": choice,
        "test_images": len(test),
        "restricted": classification_report(truth, restricted, names),
        "unrestricted": classification_report(truth, unrestricted, names),
        "unrestricted_outside_categories": float(np.mean(unrestricted < 0)),
    }
    if args.limit:
        print(f"Speed check only: restricted macro F1 {result['restricted']['macro_f1']:.3f}; nothing saved.")
        return
    (config.REPORTS_DIR / "official_baseline.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(
        f"Official ResNet-50: test macro F1 {result['restricted']['macro_f1']:.3f} restricted, "
        f"{result['unrestricted']['macro_f1']:.3f} unrestricted ({preprocessing})"
    )


if __name__ == "__main__":
    main()
