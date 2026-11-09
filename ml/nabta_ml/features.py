"""Step 3: extract image features with a frozen backbone, once, and cache them.

    python -m nabta_ml.features --backbone bioclip
    python -m nabta_ml.features --backbone resnet50 --no-augment
"""

import argparse
import json
import sys
import time

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset

from nabta_ml import config
from nabta_ml.backbones import load_backbone
from nabta_ml.dataset import read_index


class ImageFiles(Dataset):
    def __init__(self, entries, transform):
        self.entries, self.transform = entries, transform

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, i):
        with Image.open(config.SUBSET_DIR / self.entries[i]["path"]) as image:
            return self.transform(image.convert("RGB"))


def embed(encoder, entries, transform, label: str, batch_size: int = 64, workers: int = 4) -> np.ndarray:
    loader = DataLoader(ImageFiles(entries, transform), batch_size=batch_size, num_workers=workers)
    chunks, done, started = [], 0, time.time()
    with torch.inference_mode():
        for batch in loader:
            chunks.append(encoder(batch).float().numpy())
            done += len(batch)
            rate = done / (time.time() - started)
            print(f"\r  {label}: {done}/{len(entries)} images, {rate:.1f}/s", end="", flush=True)
    print()
    return np.concatenate(chunks)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--backbone", required=True, choices=["resnet50", "bioclip"])
    parser.add_argument("--no-augment", action="store_true", help="skip the extra augmented training view")
    parser.add_argument("--limit", type=int, default=0, help="only the first N images (speed check)")
    args = parser.parse_args()

    torch.manual_seed(config.SEED)
    torch.set_num_threads(max(1, torch.get_num_threads()))
    backbone = load_backbone(args.backbone)
    entries = [e for e in read_index(config.SUBSET_DIR) if not e["skipped"]]
    if args.limit:
        entries = entries[: args.limit]
    out = config.FEATURES_DIR / backbone.name
    out.mkdir(parents=True, exist_ok=True)

    started = time.time()
    plain = embed(backbone.encoder, entries, backbone.preprocess.eval_transform(), "all images")
    train = [e for e in entries if e["role"] == "supported" and e["split"] == "train"]
    augmented = None
    if not args.no_augment:
        augmented = embed(backbone.encoder, train, backbone.preprocess.augment_transform(), "augmented train view")

    if args.limit:
        print(f"Speed check only ({len(entries)} images in {time.time() - started:.0f}s); nothing saved.")
        return
    np.save(out / "plain.npy", plain.astype(np.float32))
    if augmented is not None:
        np.save(out / "augmented_train.npy", augmented.astype(np.float32))
    (out / "rows.json").write_text(
        json.dumps(
            {
                "backbone": backbone.description,
                "plain": [[e["split"], e["index"]] for e in entries],
                "augmented_train": [[e["split"], e["index"]] for e in train] if augmented is not None else [],
            }
        ),
        encoding="utf-8",
    )
    print(f"Saved {plain.shape} features to {out} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
