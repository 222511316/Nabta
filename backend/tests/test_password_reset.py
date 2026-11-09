"""US03: reset my password. A reset link allows the account owner to set a new password."""

import hashlib
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import PasswordResetToken
from tests.helpers import PASSWORD, assert_error, login, register

NEW_PASSWORD = "brand-new-password"


def request_reset(client, email="sara@example.com"):
    return client.post("/api/auth/password-reset/request", json={"email": email})


def confirm_reset(client, token, new_password=NEW_PASSWORD):
    return client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "new_password": new_password}
    )


def token_in(message, base_url="http://localhost:5173"):
    match = re.search(re.escape(base_url) + r"/reset-password\?token=([A-Za-z0-9_\-]+)", message.body)
    assert match, message.body
    return match.group(1)


@pytest.fixture
def sara(make_client):
    return register(make_client(), email="sara@example.com", full_name="Sara Ahmed")


def test_a_known_email_is_sent_a_reset_link(sara, anon, outbox):
    response = request_reset(anon)

    assert response.status_code == 202
    assert response.json() == {"ok": True}
    assert len(outbox) == 1
    assert outbox[0].to == "sara@example.com"
    assert "reset" in outbox[0].subject.lower()
    token_in(outbox[0])


def test_an_unknown_email_gets_the_same_answer_and_no_email(sara, anon, outbox):
    response = request_reset(anon, email="nobody@example.com")

    assert response.status_code == 202
    assert response.json() == {"ok": True}
    assert outbox == []


def test_the_email_is_matched_regardless_of_case(sara, anon, outbox):
    request_reset(anon, email="  Sara@EXAMPLE.com")

    assert [message.to for message in outbox] == ["sara@example.com"]


def test_a_malformed_email_is_a_validation_error(anon, outbox):
    assert_error(request_reset(anon, email="not-an-email"), 422, "validation_error", fields={"email": "invalid_email"})


def test_the_link_sets_a_new_password(sara, anon, make_client, outbox):
    request_reset(anon)

    assert confirm_reset(anon, token_in(outbox[0])).status_code == 204

    login(make_client(), password=NEW_PASSWORD)
    old = make_client().post("/api/auth/login", json={"email": "sara@example.com", "password": PASSWORD})
    assert_error(old, 401, "invalid_credentials")


def test_the_link_works_only_once(sara, anon, outbox):
    request_reset(anon)
    token = token_in(outbox[0])
    confirm_reset(anon, token)

    assert_error(confirm_reset(anon, token, "another-password"), 400, "invalid_reset_token")


def test_an_expired_link_is_refused(sara, anon, outbox, db):
    request_reset(anon)
    record = db.scalars(select(PasswordResetToken)).one()
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    assert_error(confirm_reset(anon, token_in(outbox[0])), 400, "invalid_reset_token")


def test_an_unknown_token_is_refused(anon):
    assert_error(confirm_reset(anon, "made-up-token"), 400, "invalid_reset_token")


def test_the_link_expires_after_the_configured_time(sara, anon, outbox, db):
    before = datetime.now(UTC)
    request_reset(anon)

    record = db.scalars(select(PasswordResetToken)).one()
    assert timedelta(minutes=59) < record.expires_at - before <= timedelta(minutes=60, seconds=5)


def test_resetting_signs_the_account_out_everywhere(grower, anon, outbox):
    # `grower` is Sara, signed in on another device.
    request_reset(anon)

    confirm_reset(anon, token_in(outbox[0]))

    assert_error(grower.get("/api/auth/me"), 401, "not_authenticated")


def test_using_a_link_cancels_the_other_outstanding_links(sara, anon, outbox):
    request_reset(anon)
    request_reset(anon)
    first, second = token_in(outbox[0]), token_in(outbox[1])

    confirm_reset(anon, second)

    assert_error(confirm_reset(anon, first, "another-password"), 400, "invalid_reset_token")


def test_the_new_password_must_meet_the_rules(sara, anon, outbox):
    request_reset(anon)

    response = confirm_reset(anon, token_in(outbox[0]), new_password="short")

    assert_error(response, 422, "validation_error", fields={"new_password": "too_short"})


def test_only_a_hash_of_the_token_is_stored(sara, anon, outbox, db):
    request_reset(anon)

    record = db.scalars(select(PasswordResetToken)).one()
    assert record.token_hash == hashlib.sha256(token_in(outbox[0]).encode()).hexdigest()


@pytest.mark.settings(frontend_url="https://nabta.example.org/")
def test_the_link_points_at_the_configured_frontend(sara, anon, outbox):
    request_reset(anon)

    token_in(outbox[0], base_url="https://nabta.example.org")


def test_without_smtp_the_email_is_printed_for_local_testing(sara, anon, capsys):
    request_reset(anon)

    printed = capsys.readouterr().out
    assert "sara@example.com" in printed
    assert "http://localhost:5173/reset-password?token=" in printed
