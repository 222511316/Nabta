"""The exported pest model in the backend, end to end. Skipped until one is installed in
backend/models/nabta-pest (see ml/README.md); the API tests use a fake model instead."""

import json

import pytest
from PIL import Image

from app.analysis.classifier import load_classifier
from app.config import BACKEND_DIR
from app.pests import load_catalog
from tests.helpers import add_observation, add_plant

MODEL_DIR = BACKEND_DIR / "models" / "nabta-pest"

pytestmark = pytest.mark.skipif(
    not (MODEL_DIR / "model_card.json").is_file(), reason="no pest model installed in backend/models/nabta-pest"
)


@pytest.fixture(scope="module")
def classifier():
    return load_classifier(MODEL_DIR)


def test_the_model_card_matches_the_pest_catalog(classifier):
    card = json.loads((MODEL_DIR / "model_card.json").read_text(encoding="utf-8"))
    catalog = load_catalog()

    assert [c.key for c in classifier.categories] == [pest.key for pest in catalog.pests]
    assert [c.name for c in classifier.categories] == [pest.name for pest in catalog.pests]
    assert 0 < classifier.threshold < 1
    assert 0 < classifier.familiarity_threshold < 1
    assert card["version"] == classifier.version


def test_the_model_recognises_the_reference_photos(classifier):
    """The reference photos come from the training split, so a working pipeline gets them right."""
    catalog = load_catalog()
    right, familiar, total = 0, 0, 0
    for pest in catalog.pests:
        for image in pest.images:
            with Image.open(catalog.images_dir / image.file) as photo:
                prediction = classifier.predict(photo.convert("RGB"))
            probabilities = prediction.probabilities
            assert sum(probabilities) == pytest.approx(1.0, abs=1e-5)
            best = max(range(len(probabilities)), key=probabilities.__getitem__)
            right += classifier.categories[best].key == pest.key
            familiar += prediction.familiarity >= classifier.familiarity_threshold
            total += 1
    assert right / total >= 0.9, f"{right}/{total} reference photos recognised"
    assert familiar == total, f"only {familiar}/{total} reference photos look familiar"


def test_a_grower_gets_a_real_identification(app, grower, classifier):
    app.state.classifier = classifier
    catalog = load_catalog()
    with open(catalog.images_dir / "aphids-2.jpg", "rb") as photo:
        observation = add_observation(grower, add_plant(grower)["id"], photo=photo.read())

    response = grower.post(f"/api/observations/{observation['id']}/analysis")

    assert response.status_code == 201
    result = response.json()
    assert result["model_version"] == classifier.version
    assert result["predictions"][0]["key"] == "aphids"
