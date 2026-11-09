# Nabta pest model

This folder trains and evaluates the model behind "Nabta's suggestion" (Sprint 2, US09–US11). A frozen, pretrained biology model, BioCLIP, turns each photo into features. A small classification head, trained here on IP102, chooses between Nabta's eight pest categories. Temperature scaling calibrates the confidence, and a threshold decides when a result is shown as "unclear". The design and the reasons for each choice are in [the Sprint 2 design](../docs/superpowers/specs/2026-10-18-nabta-sprint2-design.md).

The backend never needs PyTorch. It loads the exported ONNX file with onnxruntime.

## Results

- [reports/evaluation.md](reports/evaluation.md): macro F1 against the baselines, per-category precision and recall, the confusion matrix, and how often unsupported insects are rejected.
- [reports/serving.md](reports/serving.md): the exported file, its checks and its CPU latency.
- [reports/audit.md](reports/audit.md) and [reports/label-check.md](reports/label-check.md): data counts, removed duplicates and label checks.
- `reports/collected.md`, once growers' photos are collected: the same model on photos from growers, reported separately (charter §8 "practical evaluation"). It is written by the backend's `evaluate-collected` command; see "Growers' photos for research" in the [developer guide](../docs/DEVELOPMENT.md#growers-photos-for-research).

## Rebuilding the model

Everything runs on a CPU; no GPU is needed. The raw data (about 3.2 GB, plus 1.5 GB of extracted images) stays outside the repository. Set `NABTA_DATA_DIR` to a folder with room for it; the default is `ml/data/`.

```powershell
cd ml
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
$env:NABTA_DATA_DIR = "D:\nabta-data"

.venv\Scripts\python -m nabta_ml.download     # IP102 v1.1 from its Hugging Face mirror, pinned revision
.venv\Scripts\python -m nabta_ml.prepare      # extract the images Nabta uses (a few minutes)
.venv\Scripts\python -m nabta_ml.audit        # counts, contact sheets, cross-split duplicates
.venv\Scripts\python -m nabta_ml.features --backbone bioclip                # about 65 minutes
.venv\Scripts\python -m nabta_ml.features --backbone resnet50 --no-augment  # about 35 minutes
.venv\Scripts\python -m nabta_ml.official     # the published IP102 ResNet-50, see below (about 10 minutes)
.venv\Scripts\python -m nabta_ml.train        # heads, calibration, the unclear rule, report (about 10 minutes)
.venv\Scripts\python -m nabta_ml.export       # ONNX + model_card.json into backend/models/nabta-pest (1 minute)
```

Then restart the backend. It logs `Loaded pest model nabta-pest-1.0`. Without a model, the app still works, but identification answers "isn't available right now".

To fill a fresh demo database with Nabta's suggestions, run `python -m app.cli seed-demo --reset` from `backend/` after exporting.

### The published IP102 baseline

`nabta_ml.official` evaluates the ResNet-50 that the IP102 authors published (`resnet50_0.497.pkl`). Download it from the links in the [IP102 repository](https://github.com/xpwu95/IP102) and put it at `ml/resnet50_0.497.pkl`. The file is not committed. It is loaded with PyTorch's weights-only loader, which refuses anything but plain tensors. When the file is missing, the report says so and compares against the in-house ResNet-50 baseline only. If you run it after training, `python -m nabta_ml.report` adds its results to the report without retraining.

## What gets committed

| Committed | Not committed (rebuilt by the steps above) |
| --- | --- |
| Code, `categories.yaml`, tests | `NABTA_DATA_DIR`: dataset, extracted images, cached features |
| `reports/` (audit, evaluation, serving) | `ml/artifacts/`: trained heads, the ONNX file before install |
| | `backend/models/`: the installed model |
| | `ml/resnet50_0.497.pkl` |

Seeds, the category mapping, the dataset revision and the duplicate list are all fixed, so the steps give the same results again (NFR15).

## Changing the categories

Edit `categories.yaml`, then re-run every step from `prepare`. The backend's pest pages must match: `backend/content/pests/catalog.json` needs one entry per category, and a backend test checks that the two lists agree.

## Tests

```powershell
.venv\Scripts\python -m pytest
```

The tests cover the category mapping, dataset selection, duplicate hashing, the head, calibration and threshold, the metrics, and the backend's preprocessing, which must match torchvision's to within 1e-5.
