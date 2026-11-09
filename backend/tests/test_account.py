"""US04: update account details. Valid changes persist; invalid entries receive feedback."""

import pytest

from tests.helpers import PASSWORD, assert_error, login

NEW_PASSWORD = "brand-new-password"


def test_changing_the_name_persists(grower):
    response = grower.patch("/api/account", json={"full_name": "  Sara A. Ahmed "})

    assert response.status_code == 200
    assert response.json()["full_name"] == "Sara A. Ahmed"
    assert grower.get("/api/auth/me").json()["full_name"] == "Sara A. Ahmed"


def test_changing_the_email_normalizes_it_and_it_works_for_sign_in(grower, make_client):
    response = grower.patch("/api/account", json={"email": " Sara.New@Example.com "})

    assert response.json()["email"] == "sara.new@example.com"
    login(make_client(), email="sara.new@example.com")


def test_omitted_fields_are_left_alone(grower):
    response = grower.patch("/api/account", json={"full_name": "Sara A."})

    assert response.json()["email"] == "sara@example.com"


def test_keeping_the_same_email_is_not_a_conflict(grower):
    response = grower.patch("/api/account", json={"email": "SARA@example.com", "full_name": "Sara"})

    assert response.status_code == 200


def test_an_email_used_by_another_account_is_refused(grower, other_grower):
    response = grower.patch("/api/account", json={"email": "omar@example.com"})

    assert_error(response, 409, "email_taken")
    assert grower.get("/api/auth/me").json()["email"] == "sara@example.com"


@pytest.mark.parametrize(
    ("payload", "fields"),
    [
        ({"full_name": "  "}, {"full_name": "required"}),
        ({"full_name": "x" * 101}, {"full_name": "too_long"}),
        ({"email": "not-an-email"}, {"email": "invalid_email"}),
        ({"email": ""}, {"email": "required"}),
    ],
)
def test_invalid_details_are_reported_per_field(grower, payload, fields):
    assert_error(grower.patch("/api/account", json=payload), 422, "validation_error", fields=fields)


def change_password(client, current=PASSWORD, new=NEW_PASSWORD):
    return client.post(
        "/api/account/password", json={"current_password": current, "new_password": new}
    )


def test_the_password_changes_when_the_current_one_is_right(grower, make_client):
    assert change_password(grower).status_code == 204

    login(make_client(), password=NEW_PASSWORD)
    old = make_client().post("/api/auth/login", json={"email": "sara@example.com", "password": PASSWORD})
    assert_error(old, 401, "invalid_credentials")


def test_a_wrong_current_password_is_refused(grower, make_client):
    assert_error(change_password(grower, current="not-my-password"), 400, "wrong_password")
    login(make_client(), password=PASSWORD)  # unchanged


def test_changing_the_password_signs_out_other_devices_but_not_this_one(grower, make_client):
    other_device = make_client()
    login(other_device)

    change_password(grower)

    assert grower.get("/api/auth/me").status_code == 200
    assert_error(other_device.get("/api/auth/me"), 401, "not_authenticated")


def test_the_new_password_must_meet_the_rules(grower):
    response = change_password(grower, new="short")

    assert_error(response, 422, "validation_error", fields={"new_password": "too_short"})


def test_specialists_can_update_their_details_too(specialist):
    response = specialist.patch("/api/account", json={"full_name": "Dr Khalid Alharbi"})

    assert response.status_code == 200
    assert response.json()["role"] == "specialist"
