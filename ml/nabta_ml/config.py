"""Paths and fixed settings for the pipeline. Data lives outside the repo (NABTA_DATA_DIR)."""

import os
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
CATEGORIES_FILE = ML_DIR / "categories.yaml"
REPORTS_DIR = ML_DIR / "reports"  # committed: audit and evaluation results
ARTIFACTS_DIR = ML_DIR / "artifacts"  # not committed: trained heads, ONNX models

DATA_DIR = Path(os.environ.get("NABTA_DATA_DIR", ML_DIR / "data"))
RAW_DIR = DATA_DIR / "ip102-hf"  # the IP102 parquet files
SUBSET_DIR = DATA_DIR / "subset"  # images Nabta uses, extracted once
FEATURES_DIR = DATA_DIR / "features"  # cached embeddings per backbone

SEED = 2026
HELD_OUT_SAMPLE = 3000  # unsupported test images used to measure rejection

# Where the dataset came from (recorded in reports and the model card).
DATASET_SOURCE = {
    "name": "IP102 v1.1",
    "citation": "Wu et al., IP102: A Large-Scale Benchmark Dataset for Insect Pest Recognition, CVPR 2019",
    "terms": "Free for academic use",
    "obtained_from": "https://huggingface.co/datasets/EnmmmmOvO/insect-pest-dataset",
    "repository": "EnmmmmOvO/insect-pest-dataset",
    "revision": "5d1b759111eb34fb5925f68e62713c534d9a917e",  # 2024-07-04
    "why_mirror": "The official Google Drive link was over its download quota; split sizes match the official ones.",
    "split_sizes": {"train": 45095, "validation": 7508, "test": 22619},
}
