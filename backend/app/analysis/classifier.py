"""Loads the exported pest model (ONNX + model card) and turns a photo into probabilities and
a familiarity score.

The model is trained in ml/ with PyTorch; here only onnxruntime is needed. Preprocessing
follows the model card exactly, matching torchvision's Resize → CenterCrop → Normalize.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

_RESAMPLING = {"bicubic": Image.Resampling.BICUBIC, "bilinear": Image.Resampling.BILINEAR}


@dataclass(frozen=True)
class CategoryInfo:
    key: str
    name: str


@dataclass(frozen=True)
class Prediction:
    probabilities: list[float]  # one per category, in the model card's order
    familiarity: float | None  # similarity to the nearest training photo; None if the model has no such output


def preprocess(image: Image.Image, resize: int, crop: int, interpolation: str, mean, std) -> np.ndarray:
    """RGB image → float32 array (1, 3, crop, crop), as torchvision does for the training images."""
    image = image.convert("RGB")
    width, height = image.size
    short, long = (width, height) if width <= height else (height, width)
    new_short, new_long = resize, int(resize * long / short)
    size = (new_short, new_long) if width <= height else (new_long, new_short)
    image = image.resize(size, _RESAMPLING[interpolation])

    width, height = image.size
    top = int(round((height - crop) / 2.0))
    left = int(round((width - crop) / 2.0))
    image = image.crop((left, top, left + crop, top + crop))

    pixels = np.asarray(image, dtype=np.float32) / 255.0
    pixels = (pixels - np.asarray(mean, dtype=np.float32)) / np.asarray(std, dtype=np.float32)
    return pixels.transpose(2, 0, 1)[np.newaxis].astype(np.float32)


class OnnxPestClassifier:
    """The trained model. Its output logits already include the calibration temperature.

    A photo counts as identified when its top probability reaches `threshold` and its
    familiarity reaches `familiarity_threshold` (charter US10, R03).
    """

    def __init__(self, model_dir: Path):
        import onnxruntime

        card = json.loads((model_dir / "model_card.json").read_text(encoding="utf-8"))
        self.version: str = card["version"]
        self.threshold: float = float(card["threshold"])
        familiarity_threshold = card.get("familiarity_threshold")
        self.familiarity_threshold: float | None = (
            float(familiarity_threshold) if familiarity_threshold is not None else None
        )
        self.categories = [CategoryInfo(key=c["key"], name=c["name"]) for c in card["categories"]]
        self._preprocess = card["preprocess"]
        self._session = onnxruntime.InferenceSession(
            str(model_dir / card["file"]), providers=["CPUExecutionProvider"]
        )
        self._input = self._session.get_inputs()[0].name

    def predict(self, image: Image.Image) -> Prediction:
        p = self._preprocess
        tensor = preprocess(image, p["resize"], p["crop"], p["interpolation"], p["mean"], p["std"])
        outputs = self._session.run(None, {self._input: tensor})
        logits = outputs[0][0].astype(np.float64)
        exp = np.exp(logits - logits.max())
        familiarity = float(outputs[1][0]) if len(outputs) > 1 else None
        return Prediction(probabilities=(exp / exp.sum()).tolist(), familiarity=familiarity)


def load_classifier(model_dir: Path):
    """The installed model, or None if it hasn't been exported to model_dir yet."""
    if not (model_dir / "model_card.json").is_file():
        logger.warning("No pest model in %s; identification is unavailable until one is exported.", model_dir)
        return None
    classifier = OnnxPestClassifier(model_dir)
    logger.info("Loaded pest model %s", classifier.version)
    return classifier
