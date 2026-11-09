"""US01: create an account. Valid details create an account; invalid entries get feedback."""

import hashlib
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import User, UserSession
from tests.helpers import PASSWORD, assert_error, register

ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def valid_payload(**overrides):
    payload = {"full_name": "Sara Ahmed", "email": "sara@example.com", "password": PASSWORD}
    payload.update(overrides)
    return {key: value for key, value in payload.items() if value is not ...}


def test_register_returns_the_new_grower(anon):
    response = anon.post("/api/auth/register", json=valid_payload())

    assert response.status_code == 201
    user = response.json()
    assert set(user) == {
        "id",
        "email",
        "full_name",
        "role",
        "research_consent",
        "research_consent_at",
        "specialist_status",
        "approved_at",
        "created_at",
    }
    assert isinstance(user["id"], int)
    assert user["email"] == "sara@example.com"
    assert user["full_name"] == "Sara Ahmed"
    assert user["role"] == "grower"
    assert user["specialist_status"] is None  # growers need no approval
    assert user["approved_at"] is None
    assert ISO_UTC.match(user["created_at"]), user["created_at"]


def test_register_sets_a_session_cookie_that_signs_the_user_in(anon):
    response = anon.post("/api/auth/register", json=valid_payload())

    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith("nabta_session=")
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()
    assert "Path=/" in set_cookie
    assert "Max-Age=604800" in set_cookie  # NABTA_SESSION_DAYS defaults to 7
    assert "Secure" not in set_cookie

    me = anon.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == response.json()


@pytest.mark.settings(cookie_secure=True, session_days=2)
def test_cookie_follows_session_settings(anon):
    response = anon.post("/api/auth/register", json=valid_payload())

    set_cookie = response.headers["set-cookie"]
    assert "Secure" in set_cookie
    assert "Max-Age=172800" in set_cookie


def test_register_trims_name_and_normalizes_email(anon):
    response = anon.post(
        "/api/auth/register",
        json=valid_payload(full_name="  Sara Ahmed  ", email="  Sara.Ahmed@Example.COM "),
    )

    assert response.status_code == 201
    assert response.json()["full_name"] == "Sara Ahmed"
    assert response.json()["email"] == "sara.ahmed@example.com"


def test_register_rejects_an_email_already_in_use(anon, app):
    register(anon, email="sara@example.com")

    with TestClient(app) as other:
        response = other.post("/api/auth/register", json=valid_payload(email=" SARA@example.com"))

    assert_error(response, 409, "email_taken")


@pytest.mark.parametrize(
    ("overrides", "fields"),
    [
        ({"full_name": ...}, {"full_name": "required"}),
        ({"full_name": ""}, {"full_name": "required"}),
        ({"full_name": "   "}, {"full_name": "required"}),
        ({"full_name": None}, {"full_name": "required"}),
        ({"full_name": "x" * 101}, {"full_name": "too_long"}),
        ({"full_name": 42}, {"full_name": "invalid"}),
        ({"email": ""}, {"email": "required"}),
        ({"email": "not-an-email"}, {"email": "invalid_email"}),
        ({"email": "sara@localhost"}, {"email": "invalid_email"}),
        ({"email": "a" * 243 + "@example.com"}, {"email": "too_long"}),
        ({"password": ""}, {"password": "required"}),
        ({"password": "          "}, {"password": "required"}),
        ({"password": "short12"}, {"password": "too_short"}),
        ({"password": "x" * 129}, {"password": "too_long"}),
        (
            {"full_name": ..., "email": ..., "password": ...},
            {"full_name": "required", "email": "required", "password": "required"},
        ),
    ],
)
def test_register_reports_invalid_fields(anon, overrides, fields):
    response = anon.post("/api/auth/register", json=valid_payload(**overrides))

    assert_error(response, 422, "validation_error", fields=fields)


def test_register_accepts_boundary_lengths(anon):
    response = anon.post(
        "/api/auth/register",
        json=valid_payload(full_name="x" * 100, email="a" * 242 + "@example.com", password="p" * 8),
    )

    assert response.status_code == 201, response.text


def test_register_with_malformed_json_is_a_validation_error(anon):
    response = anon.post(
        "/api/auth/register", content=b"{not json", headers={"content-type": "application/json"}
    )

    assert_error(response, 422, "validation_error")


def test_password_and_session_token_are_stored_only_as_hashes(anon, db):
    register(anon, email="sara@example.com")
    cookie = anon.cookies["nabta_session"]

    user = db.scalars(select(User)).one()
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash
    session = db.scalars(select(UserSession)).one()
    assert session.token_hash == hashlib.sha256(cookie.encode()).hexdigest()
    assert session.user_id == user.id


def test_registering_while_signed_in_revokes_the_previous_session(anon, app, db):
    register(anon, email="first@example.com")
    first_cookie = anon.cookies["nabta_session"]

    register(anon, email="second@example.com")

    with TestClient(app, cookies={"nabta_session": first_cookie}) as stale:
        assert_error(stale.get("/api/auth/me"), 401, "not_authenticated")
    assert len(db.scalars(select(UserSession)).all()) == 1


# Choosing a role (team decision 2026-09-24: both roles sign up themselves) ---------------


def test_sign_up_defaults_to_the_grower_role(anon):
    assert register(anon)["role"] == "grower"


def test_a_specialist_who_signs_up_waits_for_the_team_s_approval(anon):
    """Supervisor review OBS-14: website sign-up no longer opens the review queue (FR03, FR12)."""
    response = anon.post("/api/auth/register", json=valid_payload(role="specialist"))

    assert response.status_code == 201
    assert response.json()["role"] == "specialist"
    assert response.json()["specialist_status"] == "pending"
    assert response.json()["approved_at"] is None
    assert_error(anon.get("/api/specialist/cases"), 403, "specialist_pending")
    assert_error(anon.get("/api/plants"), 403, "forbidden")


@pytest.mark.parametrize(("role", "code"), [("admin", "invalid"), (7, "invalid"), ("", "required")])
def test_only_the_two_roles_can_be_chosen(anon, role, code):
    response = anon.post("/api/auth/register", json=valid_payload(role=role))

    assert_error(response, 422, "validation_error", fields={"role": code})
