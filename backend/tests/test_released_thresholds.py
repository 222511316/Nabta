"""US09, US10, R03: Nabta's identification rule at the thresholds the RELEASED model uses.

The other analysis tests use the fake classifier's own test threshold (0.60), so they never touch the
released values at their boundaries (supervisor request, 8 November 2026). Here both thresholds are
read from the installed model card (backend/models/nabta-pest/model_card.json), so the tests follow
the released model:

  identified  ⇔  top probability >= threshold  AND  familiarity >= familiarity_threshold
  otherwise unclear, reason "unfamiliar" if familiarity is short, else "uncertain"

"Just below" a boundary is math.nextafter(value, 0): the largest float smaller than it, so the
boundary is tested exactly. Each case goes through the API with FakeClassifier, as in
test_analysis.py, so the result checked is the one saved and shown to the grower. Each case prints
its actual result (run with -s to see it).
"""

import json
import math

import pytest

from app.analysis.classifier import load_classifier
from app.config import Settings
from tests.fakes import FakeClassifier
from tests.helpers import add_observation, add_plant

MODEL_DIR = Settings(_env_file=None).model_dir  # where the app itself looks for the model
CARD_PATH = MODEL_DIR / "model_card.json"

pytestmark = pytest.mark.skipif(not CARD_PATH.is_file(), reason=f"no released model card at {CARD_PATH}")

CARD = json.loads(CARD_PATH.read_text(encoding="utf-8")) if CARD_PATH.is_file() else {}
THRESHOLD = float(CARD.get("threshold", "nan"))
FAMILIARITY_THRESHOLD = float(CARD.get("familiarity_threshold", "nan"))

JUST_BELOW_THRESHOLD = math.nextafter(THRESHOLD, 0)
JUST_BELOW_FAMILIARITY = math.nextafter(FAMILIARITY_THRESHOLD, 0)
CONFIDENT = 0.95  # well above the probability threshold
FAMILIAR = 0.90  # well above the familiarity threshold


def probabilities(top):
    """Three probabilities in FakeClassifier's category order (aphids first), summing to 1, with
    `top` (for aphids) the largest."""
    second = round((1 - top) * 0.6, 6)
    third = 1 - top - second
    values = (top, second, third)
    assert math.isclose(math.fsum(values), 1.0, abs_tol=1e-15)
    assert top > second > third > 0
    return values


@pytest.fixture
def observation(grower):
    return add_observation(grower, add_plant(grower, "Lemon tree")["id"])


def analyse_with_released_thresholds(app, grower, observation, top, familiarity, case):
    """Analyses the observation with the released thresholds; returns what the API saved and shows."""
    app.state.classifier = FakeClassifier(
        probabilities=probabilities(top),
        familiarity=familiarity,
        threshold=THRESHOLD,
        familiarity_threshold=FAMILIARITY_THRESHOLD,
    )
    response = grower.post(f"/api/observations/{observation['id']}/analysis")
    assert response.status_code == 201, response.text
    result = response.json()
    category = result["category"]["key"] if result["category"] else None
    print(
        f"\nCASE {case} | probability={top!r} | familiarity={familiarity!r} | "
        f"outcome={result['outcome']} | reason={result['unclear_reason']} | category={category}"
    )
    assert result["confidence"] == top  # the exact boundary value reached the rule and was saved
    return result


def assert_identified(result):
    assert result["outcome"] == "identified"
    assert result["unclear_reason"] is None
    assert result["category"] == {"key": "aphids", "name": "Aphids"}  # the top category


def assert_unclear(result, reason):
    assert result["outcome"] == "unclear"
    assert result["unclear_reason"] == reason
    assert result["category"] is None


# 1. The released values -------------------------------------------------------------------------


def test_the_model_card_holds_the_released_thresholds():
    """The installed card's values are the released ones the supervisor named."""
    assert CARD["threshold"] == 0.5
    assert CARD["familiarity_threshold"] == 0.6170710325241089
    assert THRESHOLD == 0.5
    assert FAMILIARITY_THRESHOLD == 0.6170710325241089


def test_the_app_s_classifier_reads_the_same_thresholds_from_the_card():
    """Loads the real ONNX model the way the app does (load_classifier) and checks what it read."""
    classifier = load_classifier(MODEL_DIR)

    assert classifier is not None
    assert classifier.threshold == THRESHOLD
    assert classifier.familiarity_threshold == FAMILIARITY_THRESHOLD
    assert classifier.version == CARD["version"]


def test_just_below_is_the_next_smaller_float():
    """The "just below" values are one float step under each boundary, with nothing in between."""
    assert JUST_BELOW_THRESHOLD < THRESHOLD and math.nextafter(JUST_BELOW_THRESHOLD, 1) == THRESHOLD
    assert JUST_BELOW_FAMILIARITY < FAMILIARITY_THRESHOLD
    assert math.nextafter(JUST_BELOW_FAMILIARITY, 1) == FAMILIARITY_THRESHOLD


# 2. Probability boundary, familiar photo ------------------------------------------------------------


def test_top_probability_exactly_at_the_threshold_is_identified(app, grower, observation):
    """Probability boundary (>=): top probability exactly 0.5, familiar photo → identified."""
    result = analyse_with_released_thresholds(app, grower, observation, THRESHOLD, FAMILIAR, "2a")

    assert_identified(result)


def test_top_probability_just_below_the_threshold_is_uncertain(app, grower, observation):
    """Probability boundary: top probability one float below 0.5, familiar photo → unclear, uncertain."""
    result = analyse_with_released_thresholds(app, grower, observation, JUST_BELOW_THRESHOLD, FAMILIAR, "2b")

    assert_unclear(result, "uncertain")


# 3. Familiarity boundary, confident photo -----------------------------------------------------------


def test_familiarity_exactly_at_its_threshold_is_identified(app, grower, observation):
    """Familiarity boundary (>=): familiarity exactly 0.6170710325241089, top 0.95 → identified."""
    result = analyse_with_released_thresholds(app, grower, observation, CONFIDENT, FAMILIARITY_THRESHOLD, "3a")

    assert_identified(result)


def test_familiarity_just_below_its_threshold_is_unfamiliar(app, grower, observation):
    """Familiarity boundary: one float below 0.6170710325241089, top 0.95 → unclear, unfamiliar."""
    result = analyse_with_released_thresholds(app, grower, observation, CONFIDENT, JUST_BELOW_FAMILIARITY, "3b")

    assert_unclear(result, "unfamiliar")


# 4 and 5. Both boundaries together ------------------------------------------------------------------


def test_both_exactly_at_their_thresholds_is_identified(app, grower, observation):
    """Both boundaries at once: probability 0.5 and familiarity 0.6170710325241089 → identified."""
    result = analyse_with_released_thresholds(
        app, grower, observation, THRESHOLD, FAMILIARITY_THRESHOLD, "4"
    )

    assert_identified(result)


def test_both_just_below_their_thresholds_is_unclear_as_unfamiliar(app, grower, observation):
    """Both one float below: unclear. The rule checks familiarity first, so the reason is
    "unfamiliar": the probabilities of a photo unlike the training photos are not trusted (R03;
    Sprint 2 design: an unfamiliar result shows no percentages)."""
    result = analyse_with_released_thresholds(
        app, grower, observation, JUST_BELOW_THRESHOLD, JUST_BELOW_FAMILIARITY, "5"
    )

    assert_unclear(result, "unfamiliar")


# 6. The 0.60 test value cannot hide a gap -----------------------------------------------------------


def test_a_top_probability_of_0_55_is_identified_with_the_released_threshold(app, grower, observation):
    """0.55 lies between the released 0.5 and the 0.60 test value: the released rule decides
    (identified), so a test written against 0.60 could not hide a wrong released threshold."""
    assert THRESHOLD <= 0.55 < 0.60
    result = analyse_with_released_thresholds(app, grower, observation, 0.55, FAMILIAR, "6")

    assert_identified(result)


def test_the_same_0_55_photo_would_be_unclear_with_the_0_60_test_value(app, grower, observation):
    """Control for case 6: with the fake's 0.60 test value the same photo is unclear, so the
    released threshold, not the test value, made case 6 identified."""
    app.state.classifier = FakeClassifier(
        probabilities=probabilities(0.55), familiarity=FAMILIAR, threshold=0.60, familiarity_threshold=FAMILIARITY_THRESHOLD
    )
    result = grower.post(f"/api/observations/{observation['id']}/analysis").json()
    print(f"\nCASE 6-control | probability=0.55 | familiarity={FAMILIAR!r} | threshold=0.60 | "
          f"outcome={result['outcome']} | reason={result['unclear_reason']}")

    assert_unclear(result, "uncertain")
