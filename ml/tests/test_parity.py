"""The backend prepares photos with numpy and Pillow only (no PyTorch). It must produce exactly
the tensors the model saw in training, or every served result quietly degrades."""

import importlib.util

import numpy as np
import pytest
from PIL import Image

from nabta_ml.backbones import CLIP_MEAN, CLIP_STD, IMAGENET_MEAN, IMAGENET_STD, Preprocess
from nabta_ml.config import ML_DIR

BACKEND_CLASSIFIER = ML_DIR.parent / "backend" / "app" / "analysis" / "classifier.py"


@pytest.fixture(scope="module")
def backend_preprocess():
    spec = importlib.util.spec_from_file_location("backend_classifier", BACKEND_CLASSIFIER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.preprocess


def photo(width: int, height: int, seed: int) -> Image.Image:
    """A photo-like image: smooth gradients plus noise, so resampling differences would show."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:height, 0:width]
    base = np.stack([x / width * 255, y / height * 255, (x + y) / (width + height) * 255], axis=-1)
    pixels = np.clip(base + rng.normal(0, 25, base.shape), 0, 255).astype(np.uint8)
    return Image.fromarray(pixels, "RGB")


@pytest.mark.parametrize(
    "preprocess",
    [
        Preprocess(224, 224, "bicubic", CLIP_MEAN, CLIP_STD),  # BioCLIP
        Preprocess(232, 224, "bilinear", IMAGENET_MEAN, IMAGENET_STD),  # ResNet-50
    ],
    ids=["bioclip", "resnet50"],
)
@pytest.mark.parametrize("size", [(640, 480), (480, 640), (301, 517), (1024, 1024), (257, 1999)])
def test_backend_preprocessing_matches_training(backend_preprocess, preprocess, size):
    image = photo(*size, seed=sum(size))

    expected = preprocess.eval_transform()(image).numpy()[np.newaxis]
    actual = backend_preprocess(
        image, preprocess.resize, preprocess.crop, preprocess.interpolation, preprocess.mean, preprocess.std
    )

    assert actual.shape == expected.shape == (1, 3, preprocess.crop, preprocess.crop)
    assert actual.dtype == np.float32
    assert np.abs(actual - expected).max() < 1e-5
