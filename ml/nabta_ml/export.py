"""Step 5: export the chosen model for the backend (charter NFR12, NFR13, NFR15).

    python -m nabta_ml.export [--version nabta-pest-1.0]

One ONNX graph holds the image encoder, the feature normalisation, the calibrated head and the
training photos' features, so the backend needs only onnxruntime. It returns the calibrated
logits and the photo's familiarity (its similarity to the nearest training photo). Next to it,
model_card.json records the version, categories, the "unclear" rule, preprocessing, dataset and
results. Before anything is written to the
backend, the graph is checked against PyTorch on real test photos prepared by the backend's
own preprocessing, and its CPU latency is measured (ml/reports/serving.md).
"""

import argparse
import hashlib
import importlib.util
import json
import shutil
import statistics
import sys
import time
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from nabta_ml import config
from nabta_ml.backbones import load_backbone
from nabta_ml.dataset import read_index
from nabta_ml.head import softmax

BACKEND_DIR = config.ML_DIR.parent / "backend"
DEFAULT_OUT = BACKEND_DIR / "models" / "nabta-pest"
CHECK_PHOTOS = 24
LATENCY_PHOTOS = 30
OPSET = 17


class PestModel(torch.nn.Module):
    """Photo tensor → (calibrated logits, familiarity): encoder, unit-length features, then the
    linear head / T, and the highest cosine similarity to the training photos."""

    def __init__(self, encoder, weights: np.ndarray, bias: np.ndarray, temperature: float, reference: np.ndarray):
        super().__init__()
        self.encoder = encoder
        self.head = torch.nn.Linear(weights.shape[1], weights.shape[0])
        with torch.no_grad():
            self.head.weight.copy_(torch.from_numpy(weights))
            self.head.bias.copy_(torch.from_numpy(bias))
        self.register_buffer("temperature", torch.tensor(float(temperature)))
        self.register_buffer("reference", torch.from_numpy(reference))

    def forward(self, image):
        features = self.encoder(image)
        features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-12)
        familiarity = (features @ self.reference.T).max(dim=-1).values
        return self.head(features) / self.temperature, familiarity


def backend_classifier_module():
    """The backend's classifier module (numpy and Pillow only), loaded straight from its file."""
    spec = importlib.util.spec_from_file_location("backend_classifier", BACKEND_DIR / "app" / "analysis" / "classifier.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="nabta-pest-1.0")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    evaluation = json.loads((config.REPORTS_DIR / "evaluation.json").read_text(encoding="utf-8"))
    name = evaluation["chosen"]
    chosen = evaluation["models"][name]
    head = np.load(config.ARTIFACTS_DIR / f"{name}-head.npz")
    backbone = load_backbone(name)
    model = PestModel(
        backbone.encoder, head["weights"], head["bias"], float(head["temperature"]), head["reference"]
    ).eval()

    staging = config.ARTIFACTS_DIR / "export"
    staging.mkdir(parents=True, exist_ok=True)
    onnx_path = staging / "model.onnx"
    print(f"Exporting {name} to ONNX…", flush=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # the TorchScript exporter's deprecation notice
        torch.onnx.export(
            model,
            (torch.zeros(1, 3, backbone.preprocess.crop, backbone.preprocess.crop),),
            str(onnx_path),
            input_names=["image"],
            output_names=["logits", "familiarity"],
            dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}, "familiarity": {0: "batch"}},
            opset_version=OPSET,
            dynamo=False,
        )

    # Check: the backend's preprocessing + ONNX against PyTorch's training pipeline, on test photos.
    import onnxruntime

    classifier = backend_classifier_module()
    session = onnxruntime.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    p = backbone.preprocess
    test = [e for e in read_index(config.SUBSET_DIR) if e["role"] == "supported" and e["split"] == "test" and not e["skipped"]]
    rng = np.random.default_rng(config.SEED)
    photos = [test[i] for i in rng.choice(len(test), size=CHECK_PHOTOS, replace=False)]
    largest_difference, agreements, input_difference, familiarity_difference = 0.0, 0, 0.0, 0.0
    for entry in photos:
        with Image.open(config.SUBSET_DIR / entry["path"]) as image:
            image = image.convert("RGB")
            prepared = classifier.preprocess(image, p.resize, p.crop, p.interpolation, p.mean, p.std)
            reference = p.eval_transform()(image).unsqueeze(0)
        input_difference = max(input_difference, float(np.abs(prepared - reference.numpy()).max()))
        served_logits, served_familiarity = session.run(None, {"image": prepared})
        served = softmax(served_logits.astype(np.float64))
        with torch.inference_mode():
            trained_logits, trained_familiarity = model(reference)
        trained = softmax(trained_logits.numpy().astype(np.float64))
        largest_difference = max(largest_difference, float(np.abs(served - trained).max()))
        familiarity_difference = max(
            familiarity_difference, float(np.abs(served_familiarity - trained_familiarity.numpy()).max())
        )
        agreements += int(served.argmax() == trained.argmax())
    if largest_difference > 1e-3 or familiarity_difference > 1e-3 or agreements != len(photos):
        raise SystemExit(f"Exported model disagrees with PyTorch (max difference {largest_difference:.2e}); not installed.")
    print(f"  checked on {len(photos)} test photos: max probability difference {largest_difference:.1e}")

    card = {
        "version": args.version,
        "created": date.today().isoformat(),
        "file": "model.onnx",
        "sha256": sha256(onnx_path),
        "backbone": chosen["description"],
        "categories": evaluation["categories"],
        # Identified only when familiarity >= familiarity_threshold and the top probability >= threshold.
        "threshold": chosen["min_confidence"],
        "familiarity_threshold": chosen["familiarity_threshold"],
        "temperature": chosen["temperature"],
        "preprocess": {
            "resize": p.resize,
            "crop": p.crop,
            "interpolation": p.interpolation,
            "mean": list(p.mean),
            "std": list(p.std),
        },
        "outputs": {
            "logits": "calibrated logits (temperature applied); softmax gives the probabilities",
            "familiarity": "cosine similarity to the nearest training photo",
        },
        "dataset": evaluation["dataset"],
        "results": {
            "test_macro_f1": chosen["test"]["macro_f1"],
            "test_accuracy": chosen["test"]["accuracy"],
            "supported_accepted": chosen["uncertainty"]["test"]["supported_accepted"],
            "accuracy_when_accepted": chosen["uncertainty"]["test"]["accuracy_when_accepted"],
            "unsupported_rejected": chosen["uncertainty"]["test"]["unsupported_rejected"],
            "report": "ml/reports/evaluation.md",
        },
        "training": {"head": "class-balanced logistic regression", "strength": chosen["strength"], "seed": evaluation["seed"]},
        "intended_use": (
            "Suggest which of Nabta's pest categories a grower's insect photo shows. A suggestion, not a "
            "diagnosis: results below the threshold are shown as unclear, and growers can ask a specialist."
        ),
        "limitations": [
            "Trained and tested on IP102 benchmark photos, not growers' own photos.",
            "Insects outside the eight categories can still receive a confident suggestion.",
        ],
    }

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(onnx_path, out / "model.onnx")
    (out / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")

    # Latency as the backend serves it: open the photo, prepare it, run the model.
    served = classifier.OnnxPestClassifier(out)
    timings = []
    for i in range(LATENCY_PHOTOS):
        entry = photos[i % len(photos)]
        started = time.perf_counter()
        with Image.open(config.SUBSET_DIR / entry["path"]) as image:
            served.predict(image.convert("RGB"))
        if i >= 3:  # the first runs warm up the session
            timings.append((time.perf_counter() - started) * 1000)
    latency = {"median_ms": statistics.median(timings), "p95_ms": sorted(timings)[int(0.95 * (len(timings) - 1))]}

    size_mb = (out / "model.onnx").stat().st_size / 1e6
    report = [
        "# Nabta pest model: serving\n",
        f"Generated by `python -m nabta_ml.export` on {card['created']}.\n",
        "| | |",
        "| --- | --- |",
        f"| Version | `{card['version']}` |",
        f"| Backbone | {card['backbone']} |",
        f"| File | `backend/models/nabta-pest/model.onnx`, {size_mb:.0f} MB, ONNX opset {OPSET} |",
        f"| SHA-256 | `{card['sha256']}` |",
        f"| Rule | identified when familiarity ≥ {card['familiarity_threshold']:.3f} and the top probability ≥ "
        f"{card['threshold']:.0%}; otherwise unclear |",
        f"| Preprocessing | shorter side to {p.resize} px ({p.interpolation}), centre crop {p.crop} px |",
        f"| CPU latency per photo | {latency['median_ms']:.0f} ms median, {latency['p95_ms']:.0f} ms p95 |",
        "",
        f"**Checks before install.** On {len(photos)} test photos, the backend's own preprocessing differed from "
        f"torchvision's by at most {input_difference:.1e} per value. The ONNX model's probabilities differed from "
        f"PyTorch's by at most {largest_difference:.1e} and its familiarity by at most "
        f"{familiarity_difference:.1e}, with the same top category every time.\n",
        "The model files are not committed (see `.gitignore`); rebuild them with the steps in `ml/README.md`.",
    ]
    (config.REPORTS_DIR / "serving.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Installed {card['version']} in {out} ({size_mb:.0f} MB); latency {latency['median_ms']:.0f} ms median")


if __name__ == "__main__":
    main()
