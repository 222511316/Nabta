"""Sprint 02 integration tests (IT-01 to IT-12): the HTTP API, services, SQLite database and
photo storage working together, checked against the Project Charter's US09–US16.

IT-01 and IT-03 use the real exported ONNX model on genuine IP102 test-split photos. The other
tests replace the model with FakeClassifier so the result is fixed; they verify the workflow,
not the model's accuracy.
"""

import re

import pytest
from fastapi.testclient import TestClient

from app.analysis.classifier import load_classifier
from app.config import BACKEND_DIR
from app.main import create_app
from app.models import Role
from app.services import users
from tests.fakes import FakeClassifier
from tests.helpers import PASSWORD, add_observation, add_plant, assert_error, login
from tests.sprint02_inputs import input_path

MODEL_DIR = BACKEND_DIR / "models" / "nabta-pest"
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
needs_model = pytest.mark.skipif(not (MODEL_DIR / "model_card.json").is_file(), reason="no pest model installed")


@pytest.fixture
def fake_model(app):
    app.state.classifier = FakeClassifier()  # suggests "aphids" at 80%
    return app.state.classifier


@pytest.fixture
def second_specialist(db, make_client):
    users.create_user(db, email="specialist2@example.com", full_name="Second Specialist", password=PASSWORD, role=Role.SPECIALIST)
    db.commit()
    client = make_client()
    login(client, email="specialist2@example.com")
    return client


@pytest.fixture
def analysed(grower, fake_model):
    plant = add_plant(grower, "Guava tree", plant_type="Guava", location="Back garden")
    observation = add_observation(grower, plant["id"], notes="Fly on a ripening guava")
    assert grower.post(f"/api/observations/{observation['id']}/analysis").status_code == 201
    return {"plant": plant, "observation": observation}


@pytest.fixture
def case(grower, analysed):
    response = grower.post(f"/api/observations/{analysed['observation']['id']}/review", json={"note": "Is this a fruit fly?"})
    assert response.status_code == 201, response.text
    return response.json()


def upload_genuine(client, plant_id, relative):
    with open(input_path(relative), "rb") as photo:
        return add_observation(client, plant_id, photo=photo.read(), filename=relative.rsplit("/", 1)[-1])


@needs_model
def test_IT01_a_genuine_fruit_fly_photo_is_identified_by_the_real_model_and_saved(app, grower):
    """IT-01 (US09, FR07, FR08, NFR13): upload → analysis with the real model → saved result
    returned again with the observation, keeping the model version."""
    app.state.classifier = load_classifier(MODEL_DIR)
    plant = add_plant(grower, "Guava tree")
    observation = upload_genuine(grower, plant["id"], "ip102_test_split/ip102_test_18671_c085.jpg")

    response = grower.post(f"/api/observations/{observation['id']}/analysis")

    assert response.status_code == 201
    result = response.json()
    assert result["outcome"] == "identified"
    assert result["category"]["key"] == "fruit_flies"
    assert result["confidence"] >= 0.9
    assert result["model_version"] == "nabta-pest-1.0"
    saved = grower.get(f"/api/observations/{observation['id']}").json()["analysis"]
    assert saved == result


def test_IT02_a_failed_analysis_saves_nothing_and_a_retry_saves_one_result(app, grower):
    """IT-02 (US09, NFR09): model error → 503 and no stored result; once the model works, the
    retry returns 201, and a further request returns the same saved result (200)."""
    plant = add_plant(grower, "Chilli pepper pots")
    observation = add_observation(grower, plant["id"])
    url = f"/api/observations/{observation['id']}/analysis"

    app.state.classifier = FakeClassifier(error=RuntimeError("model crashed"))
    assert_error(grower.post(url), 503, "analysis_failed")
    assert grower.get(f"/api/observations/{observation['id']}").json()["analysis"] is None

    app.state.classifier = FakeClassifier()
    first = grower.post(url)
    again = grower.post(url)
    assert first.status_code == 201
    assert again.status_code == 200
    assert again.json() == first.json()


@needs_model
@pytest.mark.parametrize(
    "relative",
    [
        "ip102_test_split/ip102_test_13422_c068.jpg",  # Lycorma delicatula: held-out unsupported class
        "plantvillage/pv_Tomato_healthy.jpg",  # leaf with no visible insect
        "derived_not_dataset_samples/derived_blurred_from_ip102_test_05137.jpg",  # out-of-focus photo
    ],
    ids=["unsupported-insect", "no-insect-leaf", "blurred-photo"],
)
def test_IT03_unsupported_no_insect_and_blurred_photos_are_unclear(app, grower, relative):
    """IT-03 (US10, R03): the real model returns an unclear outcome, with a reason and no category."""
    app.state.classifier = load_classifier(MODEL_DIR)
    plant = add_plant(grower, "Test plant")
    observation = upload_genuine(grower, plant["id"], relative)

    result = grower.post(f"/api/observations/{observation['id']}/analysis").json()

    assert result["outcome"] == "unclear"
    assert result["unclear_reason"] in ("unfamiliar", "uncertain")
    assert result["category"] is None
    assert len(result["predictions"]) == 3


def test_IT04_each_supported_category_has_a_description_source_and_reference_photos(grower):
    """IT-04 (US11, FR09, NFR14): every pest page returns a description, an attributed source and
    three or four reference photos that load."""
    catalog = grower.get("/api/pests").json()
    assert len(catalog) == 8
    for summary in catalog:
        pest = grower.get(f"/api/pests/{summary['key']}").json()
        assert pest["summary"] and pest["look_for"]
        assert pest["sources"] and all(s["url"].startswith("https://") for s in pest["sources"])
        assert 3 <= len(pest["images"]) <= 4
        assert all(grower.get(image["url"]).status_code == 200 for image in pest["images"])


def test_IT05_reference_content_has_been_reviewed_by_a_specialist(grower):
    """IT-05 (US11 "reviewed examples", FR09, NFR14): every pest entry records a completed
    specialist review."""
    statuses = {p["key"]: grower.get(f"/api/pests/{p['key']}").json()["review"]["status"] for p in grower.get("/api/pests").json()}

    assert statuses == {key: "reviewed" for key in statuses}


def test_IT06_a_review_request_reaches_the_specialist_with_photo_result_and_notes(grower, specialist, analysed, case):
    """IT-06 (US12, US14, FR11, FR12): the confirmed request appears in the queue as new; the case
    shows the photo, Nabta's result, the grower's notes and request note, and the status. A second
    request for the same observation is refused."""
    queue = specialist.get("/api/specialist/cases").json()
    assert [(item["id"], item["status"], item["assigned_to_me"]) for item in queue] == [(case["id"], "waiting_for_specialist", False)]

    view = specialist.get(f"/api/specialist/cases/{case['id']}").json()
    assert view["note"] == "Is this a fruit fly?"
    assert view["observation"]["notes"] == "Fly on a ripening guava"
    assert view["analysis"]["outcome"] == "identified"
    assert specialist.get(view["observation"]["photo_url"]).status_code == 200

    observation_id = analysed["observation"]["id"]
    assert_error(grower.post(f"/api/observations/{observation_id}/review", json={"note": "again"}), 409, "review_exists")


def test_IT07_review_records_are_limited_to_their_owner_and_role(grower, other_grower, specialist, analysed, case):
    """IT-07 (NFR05, NFR06): another grower cannot see, request or reply to the case; growers are
    refused the specialist endpoints; specialists are refused the grower reply endpoint."""
    observation_id = analysed["observation"]["id"]
    assert other_grower.get(f"/api/observations/{observation_id}/review").status_code == 404
    assert other_grower.post(f"/api/observations/{observation_id}/review", json={}).status_code == 404
    assert other_grower.post(f"/api/reviews/{case['id']}/replies", json={"body": "hi"}).status_code == 404
    assert grower.get("/api/specialist/cases").status_code == 403
    assert grower.get(f"/api/specialist/cases/{case['id']}").status_code == 403
    assert specialist.post(f"/api/reviews/{case['id']}/replies", json={"body": "hi"}).status_code == 403


def test_IT08_a_taken_case_is_hidden_from_other_specialists(specialist, second_specialist, case):
    """IT-08 (FR12, NFR06): after one specialist takes a case, another sees it neither in the queue
    nor by its address, and cannot take it."""
    assert specialist.post(f"/api/specialist/cases/{case['id']}/claim").json()["assigned_to_me"] is True

    assert second_specialist.get("/api/specialist/cases").json() == []
    assert second_specialist.get(f"/api/specialist/cases/{case['id']}").status_code == 404
    assert_error(second_specialist.post(f"/api/specialist/cases/{case['id']}/claim"), 409, "already_assigned")


def test_IT09_clarification_exchange_is_dated_saved_and_notified(grower, specialist, analysed, case):
    """IT-09 (US13, US15, FR13, FR15): question → "waiting_for_grower" and a grower notification;
    reply → "waiting_for_specialist" and a specialist notification; both messages keep their author
    and UTC date."""
    observation_id = analysed["observation"]["id"]
    asked = specialist.post(f"/api/specialist/cases/{case['id']}/questions", json={"body": "Are there maggots in fallen fruit?"})
    assert asked.status_code == 201 and asked.json()["status"] == "waiting_for_grower"
    inbox = grower.get("/api/notifications").json()
    assert inbox["unread"] == 1 and inbox["items"][0]["kind"] == "question_asked"

    replied = grower.post(f"/api/reviews/{case['id']}/replies", json={"body": "Yes, several in each fruit."})
    assert replied.status_code == 201
    view = grower.get(f"/api/observations/{observation_id}/review").json()
    assert view["status"] == "waiting_for_specialist"
    assert [(m["kind"], m["author_name"]) for m in view["messages"]] == [("question", "Khalid Alharbi"), ("reply", "Sara Ahmed")]
    assert all(ISO_UTC.match(m["created_at"]) for m in view["messages"])
    assert specialist.get("/api/notifications").json()["items"][0]["kind"] == "grower_replied"


def test_IT10_feedback_names_its_author_and_date_and_stays_separate_from_the_ai_result(grower, specialist, analysed, case):
    """IT-10 (US16, FR14, FR15, NFR13): agreeing feedback closes the case, records the author and
    date, is flagged as matching the suggestion, leaves the stored AI result unchanged, and
    notifies the grower."""
    observation_id = analysed["observation"]["id"]
    before = grower.get(f"/api/observations/{observation_id}").json()["analysis"]

    sent = specialist.post(
        f"/api/specialist/cases/{case['id']}/feedback",
        json={"outcome": "identified", "category_key": "aphids", "message": "Consistent with aphids."},
    )

    assert sent.status_code == 201
    feedback = grower.get(f"/api/observations/{observation_id}/review").json()["feedback"]
    assert feedback["specialist_name"] == "Khalid Alharbi"
    assert ISO_UTC.match(feedback["created_at"])
    assert feedback["matches_suggestion"] is True
    assert grower.get(f"/api/observations/{observation_id}").json()["analysis"] == before
    assert grower.get("/api/notifications").json()["items"][0]["kind"] == "feedback_sent"


def test_IT11_an_inconclusive_assessment_is_accepted_and_closes_the_case(grower, specialist, analysed, case):
    """IT-11 (US16, FR14): "can't tell" is a valid outcome; afterwards replies and further
    assessments are refused as closed."""
    sent = specialist.post(f"/api/specialist/cases/{case['id']}/feedback", json={"outcome": "inconclusive", "message": "Cannot tell from this photo."})

    assert sent.status_code == 201
    view = grower.get(f"/api/observations/{analysed['observation']['id']}/review").json()
    assert view["status"] == "answered"
    assert view["feedback"]["outcome"] == "inconclusive" and view["feedback"]["category"] is None
    assert_error(grower.post(f"/api/reviews/{case['id']}/replies", json={"body": "ok"}), 409, "case_closed")
    assert_error(
        specialist.post(f"/api/specialist/cases/{case['id']}/feedback", json={"outcome": "inconclusive", "message": "again"}),
        409, "case_closed",
    )


def test_IT12_plant_history_keeps_results_and_review_status_after_an_application_restart(settings, grower, specialist, analysed, case):
    """IT-12 (FR10, NFR08, NFR11): the plant's observation list carries the saved result and the
    review status, and both are still returned by a freshly started application on the same data."""
    specialist.post(f"/api/specialist/cases/{case['id']}/feedback", json={"outcome": "inconclusive", "message": "Cannot tell."})
    plant_id = analysed["plant"]["id"]
    before = grower.get(f"/api/plants/{plant_id}/observations").json()

    restarted = create_app(settings)
    try:
        with TestClient(restarted) as client:
            login(client, email="sara@example.com")
            after = client.get(f"/api/plants/{plant_id}/observations").json()
    finally:
        restarted.state.engine.dispose()

    assert [(o["id"], o["analysis"]["outcome"], o["review_status"]) for o in after] == [
        (analysed["observation"]["id"], "identified", "answered")
    ]
    assert after == before
