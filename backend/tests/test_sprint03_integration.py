"""Sprint 03 integration tests (IT-01 to IT-12): HTTP requests through the FastAPI routes, services,
a temporary SQLite database and photo storage, checked against the Project Charter's US17-US23
(Section 16.3), FR16-FR22 and the release requirements NFR05, NFR06, NFR08 and NFR11.

Where an observation needs Nabta's result, the trained model is replaced by FakeClassifier
(a fixed stub), so these tests verify the follow-up workflow, not the model's accuracy.
Photos are small generated JPEGs from tests/images.py; they carry no insect.
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import create_app
from app.models import Analysis, Note, Notification, Observation, ReviewCase, Task
from app.pests import load_catalog
from tests.fakes import FakeClassifier
from tests.helpers import PASSWORD, add_observation, add_plant, assert_error, login

TODAY = date.today()
GUIDANCE_KINDS = {"check", "prevent", "remove", "natural_enemies"}


def count(db, model):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


def inbox(client, today=TODAY):
    response = client.get("/api/notifications", params={"today": today.isoformat()})
    assert response.status_code == 200, response.text
    return response.json()


def summary(client):
    response = client.get("/api/summary", params={"today": TODAY.isoformat()})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def fake_model(app):
    app.state.classifier = FakeClassifier()  # stub: suggests "aphids" at 80%
    return app.state.classifier


@pytest.fixture
def lemon(grower):
    return add_plant(grower, "Lemon tree", plant_type="Lemon", location="Back garden")


@pytest.fixture
def aphid_sighting(grower, lemon, fake_model):
    observation = add_observation(grower, lemon["id"], observed_on="2026-10-20", notes="Green insects on new shoots")
    assert grower.post(f"/api/observations/{observation['id']}/analysis").status_code == 201
    return observation


# IT-01 -------------------------------------------------------------------------------------------


def test_it01_every_supported_category_links_to_readable_guidance_with_sources(grower, aphid_sighting):
    """US17, FR16, NFR14. Charter criterion (US17): supported categories link to readable guidance
    with sources. Checked in English and Arabic."""
    observation = grower.get(f"/api/observations/{aphid_sighting['id']}").json()
    assert observation["analysis"]["category"]["key"] == "aphids"  # the result names the guide to open

    pests = grower.get("/api/pests").json()
    assert len(pests) == 8
    for summary_item in pests:
        for language in ("en", "ar"):
            pest = grower.get(f"/api/pests/{summary_item['key']}", headers={"Accept-Language": language}).json()
            assert 4 <= len(pest["guidance"]) <= 6, pest["key"]
            for step in pest["guidance"]:
                assert step["kind"] in GUIDANCE_KINDS
                assert step["task"].strip() and step["text"].strip()
            assert pest["sources"] and all(s["url"].startswith("https://") for s in pest["sources"])
            assert pest["review"]["status"] in {"awaiting_review", "reviewed"}  # NFR14: status recorded
        arabic = grower.get(f"/api/pests/{summary_item['key']}", headers={"Accept-Language": "ar"}).json()
        english = grower.get(f"/api/pests/{summary_item['key']}").json()
        assert arabic["name"] != english["name"] and len(arabic["guidance"]) == len(english["guidance"])


# IT-02 -------------------------------------------------------------------------------------------


def test_it02_published_guidance_has_been_reviewed_with_reviewer_and_date():
    """FR16 ("reviewed pest-management information"), NFR14, US17. Retest of Sprint 2 DEF-01.
    Derived condition: every published guide records review status "reviewed", a reviewer and a date."""
    catalog = load_catalog()  # the shipped content/pests/catalog.json
    statuses = {pest.key: (pest.review.status, pest.review.reviewed_by, pest.review.reviewed_on)
                for pest in catalog.in_language("en")}
    not_reviewed = sorted(key for key, (status, by, on) in statuses.items() if status != "reviewed" or not by or not on)
    assert not_reviewed == [], f"guidance not reviewed: {not_reviewed}"


# IT-03 -------------------------------------------------------------------------------------------


def test_it03_a_plant_task_from_guidance_is_completed_and_its_due_reminder_appears_once(grower, lemon, aphid_sighting):
    """US18, FR17. Charter criterion (US18): plant-linked tasks can be completed; due reminders
    appear in the app."""
    created = grower.post(
        f"/api/plants/{lemon['id']}/tasks",
        json={"title": "Rinse aphids off with a strong spray of water", "due_on": TODAY.isoformat(),
              "observation_id": aphid_sighting["id"], "pest_key": "aphids"},
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert (task["plant_id"], task["plant_name"], task["observation_id"]) == (lemon["id"], "Lemon tree", aphid_sighting["id"])
    assert task["pest"] == {"key": "aphids", "name": "Aphids"} and task["done"] is False
    future = grower.post(f"/api/plants/{lemon['id']}/tasks",
                         json={"title": "Check again", "due_on": (TODAY + timedelta(days=7)).isoformat()}).json()

    assert [t["id"] for t in grower.get("/api/tasks", params={"plant_id": lemon["id"]}).json()] == [task["id"], future["id"]]

    first = inbox(grower)
    reminders = [n for n in first["items"] if n["kind"] == "task_due"]
    assert len(reminders) == 1 and reminders[0]["task_id"] == task["id"]
    assert reminders[0]["link"] == f"/plants/{lemon['id']}?tab=tasks" and first["unread"] == 1
    assert len([n for n in inbox(grower)["items"] if n["kind"] == "task_due"]) == 1  # not repeated

    done = grower.patch(f"/api/tasks/{task['id']}", json={"done": True}).json()
    assert done["done"] is True and done["done_at"]
    assert [t["id"] for t in grower.get("/api/tasks", params={"status": "done"}).json()] == [task["id"]]
    undone = grower.patch(f"/api/tasks/{task['id']}", json={"done": False}).json()
    assert undone["done"] is False and undone["done_at"] is None


# IT-04 -------------------------------------------------------------------------------------------


def test_it04_tasks_are_refused_to_other_growers_specialists_and_other_plants(grower, other_grower, specialist, lemon, fake_model):
    """US18, NFR05, NFR06. Derived condition: only the owner can list, change or delete a plant's
    tasks, and a task cannot be linked to another plant's observation."""
    fig = add_plant(grower, "Fig tree")
    fig_photo = add_observation(grower, fig["id"])
    assert_error(grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check", "observation_id": fig_photo["id"]}),
                 422, "validation_error", {"observation_id": "invalid"})
    task = grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check the lemon"}).json()

    assert_error(other_grower.get("/api/tasks", params={"plant_id": lemon["id"]}), 404, "not_found")
    assert_error(other_grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "x"}), 404, "not_found")
    assert_error(other_grower.patch(f"/api/tasks/{task['id']}", json={"done": True}), 404, "not_found")
    assert_error(other_grower.delete(f"/api/tasks/{task['id']}"), 404, "not_found")
    assert other_grower.get("/api/tasks").json() == []
    assert_error(specialist.get("/api/tasks"), 403, "forbidden")
    assert_error(specialist.patch(f"/api/tasks/{task['id']}", json={"done": True}), 403, "forbidden")

    still = grower.get("/api/tasks").json()
    assert [(t["id"], t["done"]) for t in still] == [(task["id"], False)]


# IT-05 -------------------------------------------------------------------------------------------


def test_it05_dated_notes_are_added_edited_and_retrieved_from_the_correct_plant(grower, other_grower, specialist, lemon):
    """US19, FR18, NFR06. Charter criterion (US19): notes can be added, edited, and retrieved from
    the correct plant."""
    fig = add_plant(grower, "Fig tree")
    older = grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": "2026-10-25", "body": "Watered deeply."})
    assert older.status_code == 201, older.text
    newer = grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": "2026-11-01", "body": "Fewer aphids now."}).json()
    grower.post(f"/api/plants/{fig['id']}/notes", json={"noted_on": "2026-11-01", "body": "Fig note."})

    edited = grower.patch(f"/api/notes/{older.json()['id']}", json={"body": "Watered deeply and rinsed the shoots.", "noted_on": "2026-10-26"})
    assert edited.status_code == 200 and edited.json()["body"] == "Watered deeply and rinsed the shoots."

    on_lemon = grower.get(f"/api/plants/{lemon['id']}/notes").json()
    assert [(n["noted_on"], n["body"]) for n in on_lemon] == [
        ("2026-11-01", "Fewer aphids now."), ("2026-10-26", "Watered deeply and rinsed the shoots.")]
    assert all(n["plant_id"] == lemon["id"] for n in on_lemon)
    assert [n["body"] for n in grower.get(f"/api/plants/{fig['id']}/notes").json()] == ["Fig note."]

    future = (TODAY + timedelta(days=5)).isoformat()
    assert_error(grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": future, "body": "x"}),
                 422, "validation_error", {"noted_on": "future_date"})
    assert_error(other_grower.get(f"/api/plants/{lemon['id']}/notes"), 404, "not_found")
    assert_error(other_grower.patch(f"/api/notes/{newer['id']}", json={"body": "changed"}), 404, "not_found")
    assert_error(other_grower.delete(f"/api/notes/{newer['id']}"), 404, "not_found")
    assert_error(specialist.get(f"/api/plants/{lemon['id']}/notes"), 403, "forbidden")
    assert len(grower.get(f"/api/plants/{lemon['id']}/notes").json()) == 2


# IT-06 -------------------------------------------------------------------------------------------


def test_it06_comparison_photos_come_only_from_the_owner_s_same_plant(grower, other_grower, specialist, lemon):
    """US20, FR19, NFR06. Charter criterion (US20): two photos from the same plant appear together
    with their dates. Derived condition: the photos offered are that plant's own; other growers'
    and specialists' requests for them are refused."""
    first = add_observation(grower, lemon["id"], observed_on="2026-10-20")
    second = add_observation(grower, lemon["id"], observed_on="2026-11-01")
    fig = add_plant(grower, "Fig tree")
    fig_photo = add_observation(grower, fig["id"], observed_on="2026-10-30")

    listed = grower.get(f"/api/plants/{lemon['id']}/observations").json()
    assert {(o["id"], o["observed_on"]) for o in listed} == {(first["id"], "2026-10-20"), (second["id"], "2026-11-01")}
    assert fig_photo["id"] not in {o["id"] for o in listed}
    for observation in (first, second):
        photo = grower.get(f"/api/observations/{observation['id']}/photo")
        assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"

    assert_error(other_grower.get(f"/api/plants/{lemon['id']}/observations"), 404, "not_found")
    assert_error(other_grower.get(f"/api/observations/{first['id']}/photo"), 404, "not_found")
    assert_error(specialist.get(f"/api/observations/{first['id']}/photo"), 403, "forbidden")


# IT-07 -------------------------------------------------------------------------------------------


def test_it07_search_and_filters_match_only_the_owner_s_records(app, grower, other_grower, specialist, lemon, aphid_sighting):
    """US21, FR20, NFR06. Charter criterion (US21): search and filters match records."""
    app.state.classifier = FakeClassifier(probabilities=(0.4, 0.35, 0.25))  # stub: unclear result
    fig = add_plant(grower, "Fig tree")
    unclear = add_observation(grower, fig["id"], notes="White cottony clumps")
    grower.post(f"/api/observations/{unclear['id']}/analysis")
    grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Rinse aphids off"})
    done = grower.post(f"/api/plants/{fig['id']}/tasks", json={"title": "Check the fig leaves"}).json()
    grower.patch(f"/api/tasks/{done['id']}", json={"done": True})
    grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": "2026-11-01", "body": "Aphids fewer after rinsing."})
    # Omar has his own lemon tree with aphids in its notes: it must never appear in Sara's results.
    omar_lemon = add_plant(other_grower, "Lemon tree")
    other_grower.post(f"/api/plants/{omar_lemon['id']}/notes", json={"noted_on": "2026-11-01", "body": "Aphids here too."})

    found = grower.get("/api/search", params={"q": "aphid"}).json()
    assert [o["id"] for o in found["observations"]] == [aphid_sighting["id"]]  # by the suggested pest
    assert [t["title"] for t in found["tasks"]] == ["Rinse aphids off"]
    assert [n["body"] for n in found["notes"]] == ["Aphids fewer after rinsing."]
    assert grower.get("/api/search", params={"q": "المنّ"}).json()["observations"][0]["id"] == aphid_sighting["id"]

    unclear_only = grower.get("/api/search", params={"type": "observations", "result": "unclear"}).json()
    assert [o["id"] for o in unclear_only["observations"]] == [unclear["id"]]
    assert unclear_only["plants"] == unclear_only["tasks"] == unclear_only["notes"] == []
    assert [t["title"] for t in grower.get("/api/search", params={"type": "tasks", "task_status": "open"}).json()["tasks"]] == ["Rinse aphids off"]
    assert [t["title"] for t in grower.get("/api/search", params={"type": "tasks", "task_status": "done"}).json()["tasks"]] == ["Check the fig leaves"]
    assert [p["name"] for p in grower.get("/api/search", params={"type": "plants", "q": "LEMON"}).json()["plants"]] == ["Lemon tree"]
    assert grower.get("/api/search", params={"q": "no such thing"}).json() == {"plants": [], "observations": [], "tasks": [], "notes": []}

    omar = other_grower.get("/api/search", params={"q": "aphid"}).json()
    assert [n["body"] for n in omar["notes"]] == ["Aphids here too."] and omar["observations"] == omar["tasks"] == []
    assert_error(grower.get("/api/search", params={"type": "pests"}), 422, "validation_error", {"type": "invalid"})
    assert_error(specialist.get("/api/search", params={"q": "aphid"}), 403, "forbidden")


# IT-08 -------------------------------------------------------------------------------------------


def test_it08_dashboard_summary_reflects_current_data(app, grower, specialist, lemon, aphid_sighting):
    """US21, FR20. Charter criterion (US21): summaries reflect current data."""
    app.state.classifier = FakeClassifier(probabilities=(0.4, 0.35, 0.25))  # stub: unclear result
    unclear = add_observation(grower, lemon["id"])
    grower.post(f"/api/observations/{unclear['id']}/analysis")
    overdue = grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Late", "due_on": (TODAY - timedelta(days=2)).isoformat()}).json()
    grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Today", "due_on": TODAY.isoformat()})
    grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Later", "due_on": (TODAY + timedelta(days=3)).isoformat()})
    grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Undated"})
    assert summary(grower) == {"tasks_overdue": 1, "tasks_due_today": 1, "reviews_waiting_for_you": 0,
                               "unclear_not_reviewed": 1, "open_tasks": 4}

    grower.patch(f"/api/tasks/{overdue['id']}", json={"done": True})
    case = grower.post(f"/api/observations/{unclear['id']}/review", json={"note": "What is it?"}).json()
    after = summary(grower)
    assert (after["tasks_overdue"], after["open_tasks"], after["unclear_not_reviewed"]) == (0, 3, 0)

    specialist.post(f"/api/specialist/cases/{case['id']}/claim")
    specialist.post(f"/api/specialist/cases/{case['id']}/questions", json={"body": "How many did you see?"})
    assert summary(grower)["reviews_waiting_for_you"] == 1
    grower.post(f"/api/reviews/{case['id']}/replies", json={"body": "About ten."})
    assert summary(grower)["reviews_waiting_for_you"] == 0
    assert_error(specialist.get("/api/summary"), 403, "forbidden")


# IT-09 -------------------------------------------------------------------------------------------


def test_it09_deleting_one_observation_removes_its_photo_result_and_review_but_keeps_valid_links(
    grower, specialist, lemon, aphid_sighting, settings, db
):
    """US22, FR22, NFR08. Charter criterion (US22): confirmed deletions remove selected data.
    Derived condition (NFR08): tasks that followed the observation stay with a valid link."""
    kept = add_observation(grower, lemon["id"], observed_on="2026-11-01", notes="Keep me")
    case = grower.post(f"/api/observations/{aphid_sighting['id']}/review", json={"note": "Please check"}).json()
    specialist.post(f"/api/specialist/cases/{case['id']}/claim")
    specialist.post(f"/api/specialist/cases/{case['id']}/questions", json={"body": "Closer photo?"})
    task = grower.post(f"/api/plants/{lemon['id']}/tasks",
                       json={"title": "Rinse aphids off", "observation_id": aphid_sighting["id"], "pest_key": "aphids"}).json()
    files_before = {p.name for p in settings.photos_dir.iterdir()}
    stored = db.get(Observation, aphid_sighting["id"])
    gone_files = {stored.photo_filename, stored.thumb_filename}
    assert gone_files <= files_before

    assert grower.delete(f"/api/observations/{aphid_sighting['id']}").status_code == 204

    assert_error(grower.get(f"/api/observations/{aphid_sighting['id']}"), 404, "not_found")
    assert_error(grower.get(f"/api/observations/{aphid_sighting['id']}/photo"), 404, "not_found")
    assert {p.name for p in settings.photos_dir.iterdir()} == files_before - gone_files
    assert count(db, Analysis) == 0 and count(db, ReviewCase) == 0
    assert db.scalar(select(func.count()).select_from(Notification).where(Notification.case_id.is_not(None))) == 0
    assert_error(specialist.get(f"/api/specialist/cases/{case['id']}"), 404, "not_found")
    kept_task = grower.get("/api/tasks").json()
    assert [(t["id"], t["observation_id"], t["plant_id"]) for t in kept_task] == [(task["id"], None, lemon["id"])]
    assert grower.get(f"/api/observations/{kept['id']}/photo").status_code == 200
    assert [o["id"] for o in grower.get(f"/api/plants/{lemon['id']}/observations").json()] == [kept["id"]]


# IT-10 -------------------------------------------------------------------------------------------


def test_it10_deleting_a_plant_removes_its_photos_tasks_notes_and_reminders(grower, lemon, aphid_sighting, settings, db):
    """US22, FR22, NFR08. Derived condition: deleting a plant removes all its records and photo
    files and leaves no orphaned rows; the grower's other plants are untouched."""
    fig = add_plant(grower, "Fig tree")
    fig_photo = add_observation(grower, fig["id"])
    fig_task = grower.post(f"/api/plants/{fig['id']}/tasks", json={"title": "Water the fig"}).json()
    grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Due", "due_on": TODAY.isoformat()})
    grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": "2026-11-01", "body": "Lemon note"})
    inbox(grower)  # creates the lemon task's reminder
    assert count(db, Notification) == 1
    lemon_files = {name for o in db.scalars(select(Observation).where(Observation.plant_id == lemon["id"]))
                   for name in (o.photo_filename, o.thumb_filename)}

    assert grower.delete(f"/api/plants/{lemon['id']}").status_code == 204

    assert_error(grower.get(f"/api/plants/{lemon['id']}"), 404, "not_found")
    assert not lemon_files & {p.name for p in settings.photos_dir.iterdir()}
    assert len(list(settings.photos_dir.iterdir())) == 2  # the fig's photo and thumbnail
    assert count(db, Analysis) == 0 and count(db, Note) == 0 and count(db, Notification) == 0
    assert [t["id"] for t in grower.get("/api/tasks").json()] == [fig_task["id"]]
    assert count(db, Task) == 1
    assert grower.get(f"/api/observations/{fig_photo['id']}/photo").status_code == 200


# IT-11 -------------------------------------------------------------------------------------------


def test_it11_research_consent_changes_separately_from_deletion_and_account_deletion_needs_the_password(
    app, grower, other_grower, lemon, aphid_sighting, settings, db
):
    """US22, FR22, NFR06. Charter criterion (US22): confirmed deletions remove selected data;
    research consent is separately changeable."""
    on = grower.patch("/api/account/consent", json={"research_consent": True}).json()
    assert on["research_consent"] is True and on["research_consent_at"]
    assert grower.get(f"/api/plants/{lemon['id']}/observations").json()  # consent did not touch records
    note = grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": "2026-11-01", "body": "Delete me"}).json()
    assert grower.delete(f"/api/notes/{note['id']}").status_code == 204
    assert grower.get("/api/auth/me").json()["research_consent"] is True  # deletion did not touch consent
    off = grower.patch("/api/account/consent", json={"research_consent": False}).json()
    assert off["research_consent"] is False and off["research_consent_at"] >= on["research_consent_at"]

    omar_plant = add_plant(other_grower, "Omar's basil")
    omar_photo = add_observation(other_grower, omar_plant["id"])
    assert_error(grower.request("DELETE", "/api/account", json={"password": "wrong-password-1"}), 400, "wrong_password")
    assert grower.get(f"/api/plants/{lemon['id']}").status_code == 200  # nothing removed

    assert grower.request("DELETE", "/api/account", json={"password": PASSWORD}).status_code == 204
    assert_error(grower.get("/api/auth/me"), 401, "not_authenticated")
    with TestClient(app) as again:
        assert_error(again.post("/api/auth/login", json={"email": "sara@example.com", "password": PASSWORD}), 401, "invalid_credentials")
    assert count(db, Observation) == 1 and count(db, Analysis) == 0
    assert len(list(settings.photos_dir.iterdir())) == 2  # only Omar's photo and thumbnail
    assert other_grower.get(f"/api/observations/{omar_photo['id']}/photo").status_code == 200


# IT-12 -------------------------------------------------------------------------------------------


def test_it12_tasks_notes_and_consent_survive_sign_out_and_an_application_restart(settings, app, grower, lemon):
    """NFR11, US18, US19, US22. Derived condition: follow-up records remain retrievable after
    refresh, sign-out and application restart."""
    task = grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check shoots", "due_on": TODAY.isoformat()}).json()
    note = grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": "2026-11-01", "body": "Kept"}).json()
    grower.patch("/api/account/consent", json={"research_consent": True})
    before = (grower.get("/api/tasks").json(), grower.get(f"/api/plants/{lemon['id']}/notes").json())
    assert grower.post("/api/auth/logout").status_code == 204

    restarted = create_app(settings)  # a new application instance on the same database and photos
    try:
        with TestClient(restarted) as client:
            login(client)
            after = (client.get("/api/tasks").json(), client.get(f"/api/plants/{lemon['id']}/notes").json())
            assert after == before
            assert [t["id"] for t in after[0]] == [task["id"]] and [n["id"] for n in after[1]] == [note["id"]]
            assert client.get("/api/auth/me").json()["research_consent"] is True
    finally:
        restarted.state.engine.dispose()
