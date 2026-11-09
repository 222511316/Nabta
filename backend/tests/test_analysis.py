"""US09: identify a visible insect. US10: understand uncertainty.

Analysis shows status, saves the result and supports retry after failure; results show
confidence or an unclear outcome.
"""

import re

import pytest
from sqlalchemy import func, select

from app.models import Analysis
from tests.fakes import FakeClassifier
from tests.helpers import add_observation, add_plant, assert_error

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@pytest.fixture
def classifier(app):
    fake = FakeClassifier()
    app.state.classifier = fake
    return fake


@pytest.fixture
def plant(grower):
    return add_plant(grower, "Lemon tree")


@pytest.fixture
def observation(grower, plant):
    return add_observation(grower, plant["id"])


def analyse(client, observation_id):
    return client.post(f"/api/observations/{observation_id}/analysis")


def test_a_photo_is_identified_and_the_result_saved(grower, observation, classifier):
    response = analyse(grower, observation["id"])

    assert response.status_code == 201
    result = response.json()
    assert set(result) == {
        "outcome",
        "unclear_reason",
        "category",
        "confidence",
        "predictions",
        "model_version",
        "created_at",
    }
    assert result["outcome"] == "identified"
    assert result["unclear_reason"] is None
    assert result["category"] == {"key": "aphids", "name": "Aphids"}
    assert result["confidence"] == pytest.approx(0.8)
    assert [(p["key"], p["name"]) for p in result["predictions"]] == [
        ("aphids", "Aphids"),
        ("whiteflies", "Whiteflies"),
        ("mealybugs", "Mealybugs"),
    ]
    assert [p["probability"] for p in result["predictions"]] == pytest.approx([0.8, 0.15, 0.05])
    assert result["model_version"] == "test-model-1"
    assert ISO_UTC.match(result["created_at"])


def test_the_model_looks_at_the_saved_photo(grower, observation, classifier):
    analyse(grower, observation["id"])

    assert classifier.calls == [(800, 600)]


def test_asking_again_returns_the_saved_result_without_running_the_model_twice(grower, observation, classifier):
    first = analyse(grower, observation["id"])
    second = analyse(grower, observation["id"])

    assert second.status_code == 200
    assert second.json() == first.json()
    assert len(classifier.calls) == 1


def test_a_low_confidence_result_is_unclear_but_keeps_the_possibilities(app, grower, observation):
    app.state.classifier = FakeClassifier(probabilities=(0.45, 0.35, 0.2), threshold=0.6)

    result = analyse(grower, observation["id"]).json()

    assert result["outcome"] == "unclear"
    assert result["unclear_reason"] == "uncertain"
    assert result["category"] is None
    assert result["confidence"] == pytest.approx(0.45)
    assert [p["key"] for p in result["predictions"]] == ["aphids", "whiteflies", "mealybugs"]


def test_an_insect_unlike_the_training_photos_is_unclear_even_when_the_model_is_sure(app, grower, observation, db):
    """R03: a confident answer about an insect Nabta was never trained on would mislead."""
    app.state.classifier = FakeClassifier(probabilities=(0.95, 0.03, 0.02), familiarity=0.41, familiarity_threshold=0.6)

    result = analyse(grower, observation["id"]).json()

    assert result["outcome"] == "unclear"
    assert result["unclear_reason"] == "unfamiliar"
    assert result["category"] is None
    assert db.scalar(select(Analysis.familiarity)) == pytest.approx(0.41)


def test_a_familiar_and_confident_photo_is_identified(app, grower, observation):
    app.state.classifier = FakeClassifier(probabilities=(0.95, 0.03, 0.02), familiarity=0.8, familiarity_threshold=0.6)

    result = analyse(grower, observation["id"]).json()

    assert result["outcome"] == "identified"
    assert result["unclear_reason"] is None


def test_predictions_are_ordered_most_likely_first(app, grower, observation):
    app.state.classifier = FakeClassifier(probabilities=(0.1, 0.2, 0.7))

    result = analyse(grower, observation["id"]).json()

    assert result["category"]["key"] == "mealybugs"
    assert [p["key"] for p in result["predictions"]] == ["mealybugs", "whiteflies", "aphids"]


def test_the_result_travels_with_the_observation(grower, plant, observation, classifier):
    assert grower.get(f"/api/observations/{observation['id']}").json()["analysis"] is None

    analyse(grower, observation["id"])

    detail = grower.get(f"/api/observations/{observation['id']}").json()
    assert detail["analysis"]["category"]["key"] == "aphids"
    listed = grower.get(f"/api/plants/{plant['id']}/observations").json()
    assert listed[0]["analysis"]["outcome"] == "identified"


def test_without_a_model_the_analysis_is_unavailable_and_can_be_retried(app, grower, observation, db):
    app.state.classifier = None

    assert_error(analyse(grower, observation["id"]), 503, "analysis_unavailable")
    assert db.scalar(select(func.count()).select_from(Analysis)) == 0

    app.state.classifier = FakeClassifier()
    assert analyse(grower, observation["id"]).status_code == 201


def test_a_failing_model_saves_nothing_and_can_be_retried(app, grower, observation, db):
    app.state.classifier = FakeClassifier(error=RuntimeError("model crashed"))

    assert_error(analyse(grower, observation["id"]), 503, "analysis_failed")
    assert db.scalar(select(func.count()).select_from(Analysis)) == 0

    app.state.classifier = FakeClassifier()
    assert analyse(grower, observation["id"]).status_code == 201


def test_only_the_owner_can_have_an_observation_analysed(grower, other_grower, specialist, anon, observation, classifier):
    assert_error(analyse(other_grower, observation["id"]), 404, "not_found")
    assert_error(analyse(specialist, observation["id"]), 403, "forbidden")
    assert_error(analyse(anon, observation["id"]), 401, "not_authenticated")
    assert classifier.calls == []


def test_deleting_the_plant_removes_its_analyses(grower, plant, observation, classifier, db):
    analyse(grower, observation["id"])

    grower.delete(f"/api/plants/{plant['id']}")

    assert db.scalar(select(func.count()).select_from(Analysis)) == 0
