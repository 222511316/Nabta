"""US12–US16: specialist review of a questioned result, and US13's notifications."""

import re

import pytest

from app.models import Role
from app.services import users
from tests.fakes import FakeClassifier
from tests.helpers import PASSWORD, add_observation, add_plant, assert_error, login

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
QUESTION = "Could you take a closer photo of the underside of a leaf?"
REPLY = "They're under every new leaf, and the leaves feel sticky."
ASSESSMENT = "These are whitefly nymphs, not aphids. Check the undersides of nearby plants too."


@pytest.fixture(autouse=True)
def classifier(app):
    app.state.classifier = FakeClassifier()  # suggests "aphids" at 80%


@pytest.fixture
def observation(grower):
    plant = add_plant(grower, "Lemon tree", plant_type="Lemon", location="Back garden")
    observation = add_observation(grower, plant["id"], notes="Small green insects under the leaves")
    grower.post(f"/api/observations/{observation['id']}/analysis")
    return observation


@pytest.fixture
def second_specialist(db, make_client):
    users.create_user(db, email="noura@example.com", full_name="Noura Saad", password=PASSWORD, role=Role.SPECIALIST)
    db.commit()
    client = make_client()
    login(client, email="noura@example.com")
    return client


def request_review(client, observation_id, note="Is this really aphids?"):
    return client.post(f"/api/observations/{observation_id}/review", json={"note": note})


@pytest.fixture
def case(grower, observation):
    return request_review(grower, observation["id"]).json()


def ask(client, case_id, body=QUESTION):
    return client.post(f"/api/specialist/cases/{case_id}/questions", json={"body": body})


def reply(client, case_id, body=REPLY):
    return client.post(f"/api/reviews/{case_id}/replies", json={"body": body})


def assess(client, case_id, **payload):
    body = {"outcome": "identified", "category_key": "whiteflies", "message": ASSESSMENT, **payload}
    return client.post(f"/api/specialist/cases/{case_id}/feedback", json=body)


def grower_view(client, observation_id):
    return client.get(f"/api/observations/{observation_id}/review").json()


# US12 — request manual review ---------------------------------------------------------


def test_a_grower_asks_for_a_review_with_a_note(grower, observation):
    response = request_review(grower, observation["id"])

    assert response.status_code == 201
    case = response.json()
    assert case["status"] == "waiting_for_specialist"
    assert case["note"] == "Is this really aphids?"
    assert case["specialist_name"] is None
    assert case["messages"] == []
    assert case["feedback"] is None
    assert ISO_UTC.match(case["created_at"])
    assert grower_view(grower, observation["id"]) == case
    assert grower.get(f"/api/observations/{observation['id']}").json()["review_status"] == "waiting_for_specialist"


def test_the_note_is_optional_but_limited(grower, observation):
    assert_error(request_review(grower, observation["id"], note="x" * 1001), 422, "validation_error", fields={"note": "too_long"})

    response = request_review(grower, observation["id"], note=None)

    assert response.status_code == 201
    assert response.json()["note"] is None


def test_an_observation_gets_one_review(grower, observation):
    request_review(grower, observation["id"])

    assert_error(request_review(grower, observation["id"]), 409, "review_exists")


def test_only_the_owner_can_ask_for_a_review(other_grower, specialist, anon, observation):
    assert_error(request_review(other_grower, observation["id"]), 404, "not_found")
    assert_error(request_review(specialist, observation["id"]), 403, "forbidden")
    assert_error(request_review(anon, observation["id"]), 401, "not_authenticated")


def test_an_observation_without_a_review_says_so(grower, observation):
    assert_error(grower.get(f"/api/observations/{observation['id']}/review"), 404, "not_found")
    assert grower.get(f"/api/observations/{observation['id']}").json()["review_status"] is None


# US14 — open a review case ----------------------------------------------------------


def test_waiting_cases_appear_in_the_specialist_queue(specialist, case):
    queue = specialist.get("/api/specialist/cases").json()

    assert len(queue) == 1
    item = queue[0]
    assert item["id"] == case["id"]
    assert item["status"] == "waiting_for_specialist"
    assert item["assigned_to_me"] is False
    assert item["plant_name"] == "Lemon tree"
    assert item["grower_name"] == "Sara Ahmed"
    assert item["suggestion"] == {"outcome": "identified", "name": "Aphids", "confidence": pytest.approx(0.8)}
    assert item["thumb_url"] == f"/api/specialist/cases/{case['id']}/photo?variant=thumb"


def test_a_case_shows_the_photo_result_notes_and_status(specialist, case):
    detail = specialist.get(f"/api/specialist/cases/{case['id']}").json()

    assert detail["status"] == "waiting_for_specialist"
    assert detail["note"] == "Is this really aphids?"
    assert detail["grower_name"] == "Sara Ahmed"
    assert detail["plant"] == {"name": "Lemon tree", "plant_type": "Lemon", "location": "Back garden"}
    assert detail["observation"]["notes"] == "Small green insects under the leaves"
    assert detail["analysis"]["category"]["key"] == "aphids"
    photo = specialist.get(detail["observation"]["photo_url"])
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/jpeg"


def test_taking_a_case_hides_it_from_other_specialists(specialist, second_specialist, case):
    taken = specialist.post(f"/api/specialist/cases/{case['id']}/claim")

    assert taken.status_code == 200
    assert taken.json()["assigned_to_me"] is True
    assert specialist.get("/api/specialist/cases").json()[0]["assigned_to_me"] is True
    assert second_specialist.get("/api/specialist/cases").json() == []
    assert_error(second_specialist.get(f"/api/specialist/cases/{case['id']}"), 404, "not_found")
    assert_error(second_specialist.get(f"/api/specialist/cases/{case['id']}/photo"), 404, "not_found")
    assert_error(second_specialist.post(f"/api/specialist/cases/{case['id']}/claim"), 409, "already_assigned")


def test_taking_your_own_case_again_is_harmless(specialist, case):
    specialist.post(f"/api/specialist/cases/{case['id']}/claim")

    assert specialist.post(f"/api/specialist/cases/{case['id']}/claim").status_code == 200


def test_growers_cannot_use_the_specialist_case_view(grower, case):
    assert_error(grower.get(f"/api/specialist/cases/{case['id']}"), 403, "forbidden")
    assert_error(grower.get(f"/api/specialist/cases/{case['id']}/photo"), 403, "forbidden")


# US15 — request clarification ---------------------------------------------------------


def test_a_specialist_asks_and_the_grower_replies(grower, specialist, observation, case):
    asked = ask(specialist, case["id"])

    assert asked.status_code == 201
    assert asked.json()["status"] == "waiting_for_grower"
    assert asked.json()["assigned_to_me"] is True  # asking takes the case
    view = grower_view(grower, observation["id"])
    assert view["status"] == "waiting_for_grower"
    assert view["specialist_name"] == "Khalid Alharbi"

    replied = reply(grower, case["id"])

    assert replied.status_code == 201
    assert replied.json()["status"] == "waiting_for_specialist"
    messages = grower_view(grower, observation["id"])["messages"]
    assert [(m["kind"], m["author_name"], m["body"]) for m in messages] == [
        ("question", "Khalid Alharbi", QUESTION),
        ("reply", "Sara Ahmed", REPLY),
    ]
    assert all(ISO_UTC.match(m["created_at"]) for m in messages)
    assert messages[0]["created_at"] <= messages[1]["created_at"]


def test_messages_need_text(specialist, grower, case):
    assert_error(ask(specialist, case["id"], body="  "), 422, "validation_error", fields={"body": "required"})
    assert_error(reply(grower, case["id"], body=""), 422, "validation_error", fields={"body": "required"})


def test_only_the_case_owner_can_reply(other_grower, case):
    assert_error(reply(other_grower, case["id"]), 404, "not_found")


# US16 — provide feedback ------------------------------------------------------------


def test_the_assessment_names_its_author_and_date_and_stays_apart_from_nabta_s_suggestion(
    grower, specialist, observation, case
):
    response = assess(specialist, case["id"])

    assert response.status_code == 201
    assert response.json()["status"] == "answered"
    feedback = grower_view(grower, observation["id"])["feedback"]
    assert feedback["outcome"] == "identified"
    assert feedback["category"] == {"key": "whiteflies", "name": "Whiteflies"}
    assert feedback["other_pest"] is None
    assert feedback["message"] == ASSESSMENT
    assert feedback["specialist_name"] == "Khalid Alharbi"
    assert feedback["matches_suggestion"] is False
    assert ISO_UTC.match(feedback["created_at"])
    # Nabta's own result is untouched.
    analysis = grower.get(f"/api/observations/{observation['id']}").json()["analysis"]
    assert analysis["category"]["key"] == "aphids"


def test_agreeing_with_the_suggestion_is_recorded_as_a_match(grower, specialist, observation, case):
    assess(specialist, case["id"], category_key="aphids")

    assert grower_view(grower, observation["id"])["feedback"]["matches_suggestion"] is True


def test_a_specialist_can_say_they_cannot_tell(grower, specialist, observation, case):
    assess(specialist, case["id"], outcome="inconclusive", category_key=None, message="The photo is too blurry to tell.")

    feedback = grower_view(grower, observation["id"])["feedback"]
    assert feedback["outcome"] == "inconclusive"
    assert feedback["category"] is None
    assert feedback["matches_suggestion"] is False


def test_a_pest_outside_nabta_s_list_can_be_named(grower, specialist, observation, case):
    assess(specialist, case["id"], category_key=None, other_pest="Spider mites")

    feedback = grower_view(grower, observation["id"])["feedback"]
    assert feedback["category"] is None
    assert feedback["other_pest"] == "Spider mites"


@pytest.mark.parametrize(
    ("payload", "fields"),
    [
        ({"category_key": None}, {"category_key": "required"}),  # identified needs a pest
        ({"category_key": "beetles"}, {"category_key": "invalid"}),
        ({"category_key": "aphids", "other_pest": "Spider mites"}, {"other_pest": "invalid"}),
        ({"outcome": "inconclusive", "category_key": "aphids"}, {"category_key": "invalid"}),
        ({"outcome": "maybe"}, {"outcome": "invalid"}),
        ({"message": " "}, {"message": "required"}),
        ({"message": "x" * 2001}, {"message": "too_long"}),
    ],
)
def test_assessments_are_checked(specialist, case, payload, fields):
    assert_error(assess(specialist, case["id"], **payload), 422, "validation_error", fields=fields)


def test_an_answered_case_is_closed(grower, specialist, case):
    assess(specialist, case["id"])

    assert_error(assess(specialist, case["id"]), 409, "case_closed")
    assert_error(ask(specialist, case["id"]), 409, "case_closed")
    assert_error(reply(grower, case["id"]), 409, "case_closed")


def test_answered_cases_stay_in_the_specialist_s_queue(specialist, case):
    assess(specialist, case["id"])

    assert specialist.get("/api/specialist/cases").json()[0]["status"] == "answered"


# US13 — track my request ------------------------------------------------------------


def test_the_grower_lists_their_reviews(grower, observation, case):
    reviews = grower.get("/api/reviews").json()

    assert [(r["id"], r["status"], r["plant_name"], r["observation_id"]) for r in reviews] == [
        (case["id"], "waiting_for_specialist", "Lemon tree", observation["id"])
    ]


def test_the_grower_is_notified_of_a_question_and_an_assessment(grower, specialist, observation, case):
    ask(specialist, case["id"])

    inbox = grower.get("/api/notifications").json()
    assert inbox["unread"] == 1
    note = inbox["items"][0]
    assert note["kind"] == "question_asked"
    assert note["actor_name"] == "Khalid Alharbi"
    assert note["plant_name"] == "Lemon tree"
    assert note["link"] == f"/observations/{observation['id']}"
    assert note["read"] is False

    assess(specialist, case["id"])

    kinds = [n["kind"] for n in grower.get("/api/notifications").json()["items"]]
    assert kinds == ["feedback_sent", "question_asked"]  # newest first


def test_the_specialist_is_notified_when_the_grower_replies(grower, specialist, case):
    ask(specialist, case["id"])
    reply(grower, case["id"])

    inbox = specialist.get("/api/notifications").json()
    assert inbox["unread"] == 1
    assert inbox["items"][0]["kind"] == "grower_replied"
    assert inbox["items"][0]["actor_name"] == "Sara Ahmed"
    assert inbox["items"][0]["link"] == f"/specialist/cases/{case['id']}"


def test_notifications_can_be_marked_read(grower, specialist, case):
    ask(specialist, case["id"])
    assess(specialist, case["id"])
    first = grower.get("/api/notifications").json()["items"][0]

    assert grower.post(f"/api/notifications/{first['id']}/read").status_code == 204
    assert grower.get("/api/notifications").json()["unread"] == 1
    assert grower.post("/api/notifications/read-all").status_code == 204
    assert grower.get("/api/notifications").json()["unread"] == 0


def test_people_see_only_their_own_notifications(grower, other_grower, specialist, case):
    ask(specialist, case["id"])
    note = grower.get("/api/notifications").json()["items"][0]

    assert other_grower.get("/api/notifications").json() == {"unread": 0, "items": []}
    assert_error(other_grower.post(f"/api/notifications/{note['id']}/read"), 404, "not_found")
