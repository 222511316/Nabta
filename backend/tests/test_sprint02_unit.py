"""Sprint 02 unit tests (UT-01 to UT-12): single functions of the analysis and review services,
checked in isolation against the Project Charter's US09–US16.

The database session and the model are replaced with stubs where a function needs them, so
these tests exercise the function's own logic only. UT-13 loads the real exported model file
but calls only the classifier component.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import numpy as np
import pytest
from PIL import Image

from app.analysis.classifier import Prediction, load_classifier, preprocess
from app.config import BACKEND_DIR, Settings
from app.errors import ApiError
from app.models import Analysis
from app.pests import load_catalog
from app.schemas.reviews import FeedbackIn
from app.services import analysis as analysis_service
from app.services import reviews as review_service
from tests.fakes import FakeClassifier
from tests.sprint02_inputs import input_path

MODEL_DIR = BACKEND_DIR / "models" / "nabta-pest"
MEAN, STD = [0.48145466, 0.4578275, 0.40821073], [0.26862954, 0.26130258, 0.27577711]


def run_analyse(monkeypatch, probabilities, *, familiarity=None, familiarity_threshold=None, threshold=0.6):
    """analyse() with a stub session and observation; the model answers with fixed values."""
    classifier = FakeClassifier(
        probabilities=probabilities, threshold=threshold,
        familiarity=familiarity, familiarity_threshold=familiarity_threshold,
    )
    monkeypatch.setattr(
        analysis_service, "_run_model",
        lambda clf, settings, obs: Prediction(probabilities=list(probabilities), familiarity=familiarity),
    )
    db = MagicMock()
    observation = SimpleNamespace(id=7, analysis=None, photo_filename="stub.jpg")
    analysis, created = analysis_service.analyse(db, observation, classifier, Settings(_env_file=None))
    return analysis, created, db


def test_UT01_preprocessing_produces_the_model_input_shape_and_normalisation():
    """UT-01 (FR07): a 640×480 photo becomes one 3×224×224 float32 tensor; a pixel equal to the
    mean colour becomes zero after normalisation."""
    mean_rgb = tuple(round(m * 255) for m in MEAN)
    tensor = preprocess(Image.new("RGB", (640, 480), mean_rgb), 224, 224, "bicubic", MEAN, STD)

    assert tensor.shape == (1, 3, 224, 224)
    assert tensor.dtype == np.float32
    assert np.abs(tensor).max() < 0.01


def test_UT02_a_confident_familiar_result_is_identified(monkeypatch):
    """UT-02 (US09, US10): top probability above the threshold and a familiar photo → identified."""
    analysis, created, db = run_analyse(monkeypatch, (0.8, 0.15, 0.05), familiarity=0.9, familiarity_threshold=0.6)

    assert created is True
    assert analysis.outcome == "identified"
    assert analysis.category_key == "aphids"
    assert analysis.unclear_reason is None
    assert analysis.model_version == "test-model-1"
    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_UT03_a_low_probability_result_is_unclear_and_uncertain(monkeypatch):
    """UT-03 (US10): no category reaches the threshold → unclear, reason "uncertain", no category."""
    analysis, _, _ = run_analyse(monkeypatch, (0.45, 0.35, 0.20))

    assert analysis.outcome == "unclear"
    assert analysis.unclear_reason == "uncertain"
    assert analysis.category_key is None
    assert analysis.confidence == pytest.approx(0.45)


def test_UT04_an_unfamiliar_photo_is_unclear_even_when_the_model_is_sure(monkeypatch):
    """UT-04 (US10, R03): familiarity below its threshold → unclear "unfamiliar", even at 95%."""
    analysis, _, _ = run_analyse(monkeypatch, (0.95, 0.04, 0.01), familiarity=0.40, familiarity_threshold=0.60)

    assert analysis.outcome == "unclear"
    assert analysis.unclear_reason == "unfamiliar"
    assert analysis.category_key is None


def test_UT05_a_probability_exactly_at_the_threshold_is_identified(monkeypatch):
    """UT-05 (US10, boundary): top probability equal to the threshold counts as identified."""
    analysis, _, _ = run_analyse(monkeypatch, (0.6, 0.3, 0.1), threshold=0.6)

    assert analysis.outcome == "identified"


def test_UT06_an_observation_that_already_has_a_result_is_not_analysed_again(monkeypatch):
    """UT-06 (US09, NFR09): a saved analysis is returned as is; the model is not run and nothing
    new is written, so retries cannot duplicate a result."""
    saved = Analysis(outcome="identified", category_key="aphids", confidence=0.8, predictions=[], model_version="v1")
    observation = SimpleNamespace(id=7, analysis=saved, photo_filename="stub.jpg")
    run_model = MagicMock()
    monkeypatch.setattr(analysis_service, "_run_model", run_model)
    db = MagicMock()

    analysis, created = analysis_service.analyse(db, observation, FakeClassifier(), Settings(_env_file=None))

    assert analysis is saved and created is False
    run_model.assert_not_called()
    db.add.assert_not_called()


def test_UT07_without_a_model_analysis_is_refused_as_unavailable():
    """UT-07 (US09): no installed model → 503 "analysis_unavailable", nothing written."""
    db = MagicMock()
    observation = SimpleNamespace(id=7, analysis=None, photo_filename="stub.jpg")

    with pytest.raises(ApiError) as error:
        analysis_service.analyse(db, observation, None, Settings(_env_file=None))

    assert error.value.status_code == 503
    assert error.value.code == "analysis_unavailable"
    db.add.assert_not_called()


def test_UT08_the_api_result_names_a_category_only_when_identified():
    """UT-08 (FR08, NFR13): to_out() keeps the predictions and model version; an unclear result
    carries no category."""
    predictions = [
        {"key": "thrips", "name": "Thrips", "probability": 0.41},
        {"key": "aphids", "name": "Aphids", "probability": 0.30},
        {"key": "whiteflies", "name": "Whiteflies", "probability": 0.10},
    ]
    created = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)
    unclear = Analysis(outcome="unclear", unclear_reason="uncertain", category_key=None, confidence=0.41,
                       predictions=predictions, model_version="nabta-pest-1.0", created_at=created)
    identified = Analysis(outcome="identified", unclear_reason=None, category_key="thrips", confidence=0.81,
                          predictions=predictions, model_version="nabta-pest-1.0", created_at=created)

    unclear_out = analysis_service.to_out(unclear)
    identified_out = analysis_service.to_out(identified)

    assert unclear_out.category is None and unclear_out.unclear_reason == "uncertain"
    assert [p.key for p in unclear_out.predictions] == ["thrips", "aphids", "whiteflies"]
    assert identified_out.category.key == "thrips"
    assert identified_out.model_version == "nabta-pest-1.0"
    assert analysis_service.to_out(None) is None


@pytest.mark.parametrize(
    "payload, field, code",
    [
        ({"outcome": "inconclusive", "category_key": "aphids", "message": "m"}, "category_key", "invalid"),
        ({"outcome": "identified", "message": "m"}, "category_key", "required"),
        ({"outcome": "identified", "category_key": "aphids", "other_pest": "Ladybird", "message": "m"}, "other_pest", "invalid"),
    ],
    ids=["inconclusive-with-pest", "identified-without-pest", "both-pest-fields"],
)
def test_UT09_contradictory_assessments_are_rejected(payload, field, code):
    """UT-09 (US16, FR14): an assessment must be either a named pest or inconclusive, not both."""
    with pytest.raises(ApiError) as error:
        review_service._check_feedback(FeedbackIn(**payload), load_catalog())

    assert error.value.status_code == 422
    assert error.value.fields == {field: code}


def test_UT10_an_assessment_naming_a_pest_outside_the_catalog_key_list_is_rejected():
    """UT-10 (US16): category_key must be one of Nabta's pests; a free-text pest goes in other_pest."""
    with pytest.raises(ApiError) as error:
        review_service._check_feedback(
            FeedbackIn(outcome="identified", category_key="ladybirds", message="m"), load_catalog()
        )
    assert error.value.fields == {"category_key": "invalid"}


@pytest.mark.parametrize(
    "payload",
    [
        {"outcome": "identified", "category_key": "fruit_flies", "message": "m"},
        {"outcome": "identified", "other_pest": "Spotted lanternfly", "message": "m"},
        {"outcome": "inconclusive", "message": "m"},
    ],
    ids=["catalog-pest", "other-pest", "inconclusive"],
)
def test_UT11_valid_assessments_pass_validation(payload):
    """UT-11 (US16, FR14): a catalog pest, a named other pest, or an inconclusive outcome."""
    assert review_service._check_feedback(FeedbackIn(**payload), load_catalog()) is None


def test_UT12_an_answered_case_refuses_further_replies():
    """UT-12 (US15, US16): once answered, a case is closed; reply() fails before writing."""
    db = MagicMock()
    case = SimpleNamespace(id=1, status="answered", specialist_id=2)

    with pytest.raises(ApiError) as error:
        review_service.reply(db, SimpleNamespace(id=1), case, "One more thing")

    assert error.value.status_code == 409 and error.value.code == "case_closed"
    db.add.assert_not_called()


@pytest.mark.skipif(not (MODEL_DIR / "model_card.json").is_file(), reason="no pest model installed")
def test_UT13_the_exported_classifier_returns_a_probability_per_category():
    """UT-13 (FR07): the real ONNX classifier, on a genuine IP102 test-split photo, returns one
    probability per supported category (summing to 1) and a familiarity score."""
    classifier = load_classifier(MODEL_DIR)
    with Image.open(input_path("ip102_test_split/ip102_test_18671_c085.jpg")) as photo:
        prediction = classifier.predict(photo.convert("RGB"))

    assert classifier.version == "nabta-pest-1.0"
    assert len(prediction.probabilities) == len(classifier.categories) == 8
    assert sum(prediction.probabilities) == pytest.approx(1.0, abs=1e-6)
    assert -1.0 <= prediction.familiarity <= 1.0
