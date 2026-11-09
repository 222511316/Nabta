"""The AI features (OpenAI): plant reports, specialist drafts and questions about a pest.

Guardrails under test: text only, no names or emails sent, grounded in Nabta's own data and
reviewed pest pages, and nothing works (or breaks) without an API key.
"""

import json

import pytest
from sqlalchemy import func, select

from app.models import PlantReport
from tests.fakes import FakeClassifier, FakeWriter
from tests.helpers import add_observation, add_plant, assert_error

PRIVATE = ("Sara Ahmed", "sara@example.com", "Khalid Alharbi", "khalid@example.com")


@pytest.fixture
def writer(app):
    fake = FakeWriter()
    app.state.ai = fake
    return fake


@pytest.fixture
def lemon(grower):
    return add_plant(grower, "Lemon tree", plant_type="Lemon", location="Back garden")


@pytest.fixture
def analysed(app, grower, lemon):
    """An observation Nabta identified as aphids, sent for review and answered by Khalid."""
    app.state.classifier = FakeClassifier(probabilities=(0.9, 0.06, 0.04))
    observation = add_observation(grower, lemon["id"], notes="Green insects under the new leaves.")
    grower.post(f"/api/observations/{observation['id']}/analysis")
    return observation


def sent_text(writer) -> str:
    return json.dumps(writer.requests, ensure_ascii=False)


# Status -------------------------------------------------------------------------------------


def test_ai_is_off_without_an_api_key(grower):
    assert grower.get("/api/ai").json() == {"enabled": False, "model": None}


def test_ai_reports_its_model_when_on(grower, writer):
    assert grower.get("/api/ai").json() == {"enabled": True, "model": "test-llm"}


# Plant report -------------------------------------------------------------------------------


def test_a_grower_gets_a_report_on_their_plant(grower, lemon, analysed, writer):
    response = grower.post(f"/api/plants/{lemon['id']}/report")

    assert response.status_code == 201
    report = response.json()
    assert set(report) == {"summary", "timeline", "open_items", "next_steps", "model", "created_at"}
    assert report["model"] == "test-llm"
    assert report["summary"] == "Aphids were found once on this lemon tree."
    assert report["next_steps"][0] == {"text": "Check the soft new growth each week.", "pest": {"key": "aphids", "name": "Aphids"}}


def test_the_report_is_built_from_the_plant_s_own_records(grower, lemon, analysed, writer):
    grower.post(f"/api/plants/{lemon['id']}/report")

    facts = writer.requests[0]["facts"]
    assert facts["plant"] == {"name": "Lemon tree", "type": "Lemon", "location": "Back garden", "notes": None}
    assert facts["observations"][0]["notes"] == "Green insects under the new leaves."
    assert facts["observations"][0]["nabta"]["pest"] == "Aphids"
    assert [guide["key"] for guide in facts["pest_guides"]] == ["aphids"]
    assert "never name pesticides" in writer.requests[0]["instructions"].lower()


def test_no_names_emails_or_photos_are_sent(grower, specialist, lemon, analysed, writer, db):
    case = grower.post(f"/api/observations/{analysed['id']}/review", json={"note": "Is it bad?"}).json()
    specialist.post(f"/api/specialist/cases/{case['id']}/questions", json={"body": "Any ants?"})
    grower.post(f"/api/reviews/{case['id']}/replies", json={"body": "Yes, a few."})

    grower.post(f"/api/plants/{lemon['id']}/report")
    specialist.post(f"/api/specialist/cases/{case['id']}/draft", json={})
    grower.post("/api/pests/aphids/questions", json={"question": "Do they bite?", "observation_id": analysed["id"]})

    text = sent_text(writer)
    for private in PRIVATE:
        assert private not in text
    assert "/photo" not in text and ".jpg" not in text
    messages = writer.requests[0]["facts"]["observations"][0]["review"]["messages"]
    assert [m["from"] for m in messages] == ["specialist", "grower"]


def test_the_latest_report_is_kept_and_shown_again_without_asking_the_model(grower, lemon, analysed, writer, db):
    assert_error(grower.get(f"/api/plants/{lemon['id']}/report"), 404, "not_found")
    written = grower.post(f"/api/plants/{lemon['id']}/report").json()

    shown = grower.get(f"/api/plants/{lemon['id']}/report")

    assert shown.status_code == 200
    assert shown.json() == written
    assert len(writer.requests) == 1
    assert db.scalar(select(func.count()).select_from(PlantReport)) == 1


def test_a_step_citing_a_guide_it_was_not_given_loses_the_citation(app, grower, lemon, analysed):
    app.state.ai = FakeWriter(
        outputs={"plant_report": {
            "summary": "s", "timeline": [], "open_items": [],
            "next_steps": [{"text": "Look for thrips.", "pest_key": "thrips"}],
        }}
    )

    report = grower.post(f"/api/plants/{lemon['id']}/report").json()

    assert report["next_steps"] == [{"text": "Look for thrips.", "pest": None}]


def test_only_the_owner_can_get_a_plant_report(grower, other_grower, specialist, anon, lemon, writer):
    url = f"/api/plants/{lemon['id']}/report"
    assert_error(other_grower.post(url), 404, "not_found")
    assert_error(specialist.post(url), 403, "forbidden")
    assert_error(anon.post(url), 401, "not_authenticated")
    assert writer.requests == []


def test_without_an_api_key_reports_are_unavailable(grower, lemon):
    assert_error(grower.post(f"/api/plants/{lemon['id']}/report"), 503, "ai_unavailable")


def test_an_openai_failure_saves_nothing_and_can_be_retried(app, grower, lemon, db):
    app.state.ai = FakeWriter(error=TimeoutError("OpenAI took too long"))

    assert_error(grower.post(f"/api/plants/{lemon['id']}/report"), 503, "ai_failed")
    assert db.scalar(select(func.count()).select_from(PlantReport)) == 0

    app.state.ai = FakeWriter()
    assert grower.post(f"/api/plants/{lemon['id']}/report").status_code == 201


def test_deleting_the_plant_removes_its_reports(grower, lemon, writer, db):
    grower.post(f"/api/plants/{lemon['id']}/report")

    grower.delete(f"/api/plants/{lemon['id']}")

    assert db.scalar(select(func.count()).select_from(PlantReport)) == 0


# Specialist draft -----------------------------------------------------------------------------


@pytest.fixture
def case(grower, specialist, analysed):
    created = grower.post(f"/api/observations/{analysed['id']}/review", json={"note": "Is it bad?"}).json()
    specialist.post(f"/api/specialist/cases/{created['id']}/claim")
    return created


def test_a_specialist_gets_a_draft_that_follows_their_decision(specialist, case, writer):
    response = specialist.post(
        f"/api/specialist/cases/{case['id']}/draft",
        json={"outcome": "identified", "category_key": "aphids"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "These look like aphids on the new growth.", "model": "test-llm"}
    facts = writer.requests[0]["facts"]
    assert facts["decision"] == {"outcome": "identified", "pest": "Aphids"}
    assert facts["request_note"] == "Is it bad?"
    assert facts["nabta"]["pest"] == "Aphids"
    assert [guide["key"] for guide in facts["pest_guides"]][0] == "aphids"


def test_a_draft_needs_no_decision(specialist, case, writer):
    assert specialist.post(f"/api/specialist/cases/{case['id']}/draft", json={}).status_code == 200
    assert writer.requests[0]["facts"]["decision"] is None


def test_drafts_follow_the_case_rules(grower, specialist, case, writer):
    assert_error(grower.post(f"/api/specialist/cases/{case['id']}/draft", json={}), 403, "forbidden")
    specialist.post(
        f"/api/specialist/cases/{case['id']}/feedback",
        json={"outcome": "inconclusive", "message": "Need a closer photo."},
    )
    assert_error(specialist.post(f"/api/specialist/cases/{case['id']}/draft", json={}), 409, "case_closed")


# Questions about a pest -------------------------------------------------------------------------


def test_anyone_signed_in_can_ask_about_a_pest(grower, specialist, writer):
    for client in (grower, specialist):
        response = client.post("/api/pests/aphids/questions", json={"question": "Where do they hide?"})
        assert response.status_code == 200
        assert response.json() == {
            "answer": "On soft new shoots and under leaves.",
            "covered_by_guide": True,
            "suggest_specialist": False,
            "model": "test-llm",
        }
    facts = writer.requests[0]["facts"]
    assert facts["question"] == "Where do they hide?"
    assert facts["pest_guide"]["key"] == "aphids"
    assert facts["pest_guide"]["look_for"]
    assert facts["plant"] is None


def test_a_question_from_an_observation_brings_the_plant_s_context(grower, analysed, writer):
    grower.post("/api/pests/aphids/questions", json={"question": "Is my tree in danger?", "observation_id": analysed["id"]})

    assert writer.requests[0]["facts"]["plant"] == {"type": "Lemon", "location": "Back garden"}


def test_questions_are_checked(grower, other_grower, analysed, writer):
    assert_error(grower.post("/api/pests/aphids/questions", json={"question": "  "}), 422, "validation_error", {"question": "required"})
    assert_error(grower.post("/api/pests/aphids/questions", json={"question": "x" * 301}), 422, "validation_error", {"question": "too_long"})
    assert_error(grower.post("/api/pests/ladybirds/questions", json={"question": "Hi?"}), 404, "not_found")
    assert_error(
        other_grower.post("/api/pests/aphids/questions", json={"question": "Hi?", "observation_id": analysed["id"]}),
        404,
        "not_found",
    )
    assert writer.requests == []
