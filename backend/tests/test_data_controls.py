"""US22: growers delete selected records, or everything, and manage research consent separately."""

from datetime import date

import pytest
from sqlalchemy import func, select

from app.models import Analysis, Note, Observation, ReviewCase, Task, User
from tests.fakes import FakeClassifier
from tests.helpers import PASSWORD, add_observation, add_plant, assert_error, login


@pytest.fixture
def lemon(grower):
    return add_plant(grower, "Lemon tree")


def count(db, model):
    return db.scalar(select(func.count()).select_from(model))


# One observation -----------------------------------------------------------------------------


def test_a_grower_deletes_one_observation_with_its_photo_result_and_review(app, grower, lemon, settings, db):
    app.state.classifier = FakeClassifier()
    kept = add_observation(grower, lemon["id"], notes="Keep me")
    gone = add_observation(grower, lemon["id"], notes="Delete me")
    grower.post(f"/api/observations/{gone['id']}/analysis")
    grower.post(f"/api/observations/{gone['id']}/review", json={"note": "What is it?"})
    task = grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check", "observation_id": gone["id"]}).json()
    photos_before = len(list(settings.photos_dir.iterdir()))

    assert grower.delete(f"/api/observations/{gone['id']}").status_code == 204

    assert_error(grower.get(f"/api/observations/{gone['id']}"), 404, "not_found")
    assert grower.get(f"/api/observations/{kept['id']}").status_code == 200
    assert grower.get(f"/api/plants/{lemon['id']}").json()["observation_count"] == 1
    assert len(list(settings.photos_dir.iterdir())) == photos_before - 2  # photo and thumbnail
    assert count(db, Analysis) == 0 and count(db, ReviewCase) == 0
    # The task stays; it just no longer points at the deleted observation.
    assert grower.get("/api/tasks").json()[0]["observation_id"] is None
    assert task["id"]


def test_only_the_owner_can_delete_an_observation(grower, other_grower, specialist, lemon):
    observation = add_observation(grower, lemon["id"])

    assert_error(other_grower.delete(f"/api/observations/{observation['id']}"), 404, "not_found")
    assert_error(specialist.delete(f"/api/observations/{observation['id']}"), 403, "forbidden")
    assert grower.get(f"/api/observations/{observation['id']}").status_code == 200


# Research consent ------------------------------------------------------------------------------


def test_research_consent_is_off_until_the_grower_switches_it_on(grower):
    me = grower.get("/api/auth/me").json()
    assert me["research_consent"] is False and me["research_consent_at"] is None

    on = grower.patch("/api/account/consent", json={"research_consent": True})
    assert on.status_code == 200
    assert on.json()["research_consent"] is True and on.json()["research_consent_at"] is not None

    off = grower.patch("/api/account/consent", json={"research_consent": False}).json()
    assert off["research_consent"] is False
    assert off["research_consent_at"] is not None  # when it was last changed


def test_consent_is_for_growers_photos(specialist):
    assert_error(specialist.patch("/api/account/consent", json={"research_consent": True}), 403, "forbidden")


# The whole account -------------------------------------------------------------------------------


def test_deleting_the_account_removes_all_the_grower_s_data(app, grower, other_grower, lemon, settings, db, make_client):
    add_observation(grower, lemon["id"])
    grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check"})
    grower.post(f"/api/plants/{lemon['id']}/notes", json={"noted_on": date.today().isoformat(), "body": "A note."})
    theirs = add_plant(other_grower, "Omar's fig")
    add_observation(other_grower, theirs["id"])

    response = grower.request("DELETE", "/api/account", json={"password": PASSWORD})

    assert response.status_code == 204
    assert "nabta_session" in response.headers.get("set-cookie", "")
    assert_error(grower.get("/api/auth/me"), 401, "not_authenticated")
    assert db.scalar(select(User).where(User.email == "sara@example.com")) is None
    assert count(db, Task) == 0 and count(db, Note) == 0
    assert count(db, Observation) == 1  # only Omar's
    assert len(list(settings.photos_dir.iterdir())) == 2  # Omar's photo and thumbnail
    assert other_grower.get(f"/api/plants/{theirs['id']}").status_code == 200
    again = make_client()
    assert_error(again.post("/api/auth/login", json={"email": "sara@example.com", "password": PASSWORD}), 401, "invalid_credentials")
    assert login


def test_the_password_is_needed_to_delete_the_account(grower, lemon, db):
    assert_error(grower.request("DELETE", "/api/account", json={"password": "wrong-password-1"}), 400, "wrong_password")
    assert grower.get(f"/api/plants/{lemon['id']}").status_code == 200


def test_specialist_accounts_are_removed_by_the_team(specialist):
    assert_error(specialist.request("DELETE", "/api/account", json={"password": PASSWORD}), 403, "forbidden")
