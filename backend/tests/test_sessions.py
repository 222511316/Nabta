"""US02: sign in and out. Valid credentials open the workspace; sign-out ends protected access."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import UserSession
from tests.helpers import PASSWORD, assert_error, login, register


@pytest.fixture
def sara(make_client):
    """Sara has an account but this browser is not signed in."""
    return register(make_client(), email="sara@example.com", full_name="Sara Ahmed")


def test_valid_credentials_sign_in(sara, anon):
    user = login(anon, email="sara@example.com")

    assert user == sara
    assert anon.cookies.get("nabta_session")
    assert anon.get("/api/auth/me").json() == sara


def test_sign_in_ignores_email_case_and_spaces(sara, anon):
    user = login(anon, email="  SARA@Example.com ")

    assert user["id"] == sara["id"]


@pytest.mark.parametrize(
    ("email", "password"),
    [("sara@example.com", "wrong-password"), ("nobody@example.com", PASSWORD)],
    ids=["wrong password", "unknown email"],
)
def test_bad_credentials_are_refused_without_saying_which_part_was_wrong(sara, anon, email, password):
    response = anon.post("/api/auth/login", json={"email": email, "password": password})

    assert_error(response, 401, "invalid_credentials")
    assert "set-cookie" not in response.headers


def test_sign_in_needs_both_fields(anon):
    response = anon.post("/api/auth/login", json={"email": " ", "password": ""})

    assert_error(response, 422, "validation_error", fields={"email": "required", "password": "required"})


def test_me_without_a_session_is_not_authenticated(anon):
    assert_error(anon.get("/api/auth/me"), 401, "not_authenticated")


def test_me_with_an_unknown_session_token_is_not_authenticated(make_client):
    client = make_client(cookies={"nabta_session": "made-up-token"})

    assert_error(client.get("/api/auth/me"), 401, "not_authenticated")


def test_sign_out_ends_protected_access_even_for_a_copied_cookie(grower, make_client, db):
    cookie = grower.cookies["nabta_session"]

    response = grower.post("/api/auth/logout")

    assert response.status_code == 204
    assert 'nabta_session=""' in response.headers["set-cookie"] or "Max-Age=0" in response.headers["set-cookie"]
    replay = make_client(cookies={"nabta_session": cookie})
    assert_error(replay.get("/api/auth/me"), 401, "not_authenticated")
    assert db.scalars(select(UserSession)).all() == []


def test_sign_out_without_a_session_is_harmless(anon):
    assert anon.post("/api/auth/logout").status_code == 204


def test_an_expired_session_is_refused_and_removed(grower, db):
    session = db.scalars(select(UserSession)).one()
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    assert_error(grower.get("/api/auth/me"), 401, "not_authenticated")
    db.expire_all()
    assert db.scalars(select(UserSession)).all() == []


def test_signing_in_again_replaces_this_browser_s_session(sara, anon, make_client, db):
    login(anon, email="sara@example.com")
    first_cookie = anon.cookies["nabta_session"]

    login(anon, email="sara@example.com")

    replay = make_client(cookies={"nabta_session": first_cookie})
    assert_error(replay.get("/api/auth/me"), 401, "not_authenticated")
    assert len(db.scalars(select(UserSession)).all()) == 2  # Sara's registration browser + this one


def test_each_browser_gets_its_own_session(sara, make_client):
    phone, laptop = make_client(), make_client()
    login(phone, email="sara@example.com")
    login(laptop, email="sara@example.com")

    phone.post("/api/auth/logout")

    assert laptop.get("/api/auth/me").status_code == 200


# Signing in to the chosen workspace ----------------------------------------------------


def sign_in_as(client, role, password=PASSWORD):
    return client.post(
        "/api/auth/login", json={"email": "sara@example.com", "password": password, "role": role}
    )


def test_signing_in_with_the_account_s_own_role_works(sara, anon):
    assert sign_in_as(anon, "grower").json() == sara


def test_signing_in_to_the_other_role_s_workspace_is_refused(sara, anon):
    response = sign_in_as(anon, "specialist")

    assert_error(response, 403, "role_mismatch")
    assert "set-cookie" not in response.headers
    assert_error(anon.get("/api/auth/me"), 401, "not_authenticated")


def test_a_wrong_password_is_reported_before_any_role_check(sara, anon):
    assert_error(sign_in_as(anon, "specialist", password="wrong-password"), 401, "invalid_credentials")


def test_an_unknown_role_is_a_validation_error(sara, anon):
    assert_error(sign_in_as(anon, "admin"), 422, "validation_error", fields={"role": "invalid"})
