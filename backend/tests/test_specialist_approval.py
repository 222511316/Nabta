"""Specialist approval (FR03, FR12, NFR05, NFR06; supervisor review OBS-14 and Sprint 1 §5).

A specialist who signs up on the website is pending: they can sign in and manage their account, but
see no review cases or grower data until the Nabta team approves them from the command line.
`create-specialist` (the team's own accounts) makes an approved account. No admin role, no admin screens.
"""

import pytest
from sqlalchemy import select

from app import cli
from app.models import ReviewCase, User
from tests.helpers import PASSWORD, add_observation, add_plant, assert_error, login, register

PENDING_EMAIL = "huda@example.com"


def run(settings, *args):
    return cli.main(list(args), settings=settings)


@pytest.fixture
def case(grower):
    plant = add_plant(grower, "Lemon tree", plant_type="Lemon", location="Back garden")
    observation = add_observation(grower, plant["id"], notes="Small green insects.")
    return grower.post(f"/api/observations/{observation['id']}/review", json={"note": "Is this aphids?"}).json()


def case_endpoints(case_id):
    return [
        ("GET", "/api/specialist/cases", {}),
        ("GET", f"/api/specialist/cases/{case_id}", {}),
        ("GET", f"/api/specialist/cases/{case_id}/photo", {}),
        ("GET", f"/api/specialist/cases/{case_id}/photo?variant=thumb", {}),
    ]


def assert_blocked(client, case_id):
    for method, path, kwargs in case_endpoints(case_id):
        assert_error(client.request(method, path, **kwargs), 403, "specialist_pending")


def assert_allowed(client, case_id):
    for method, path, kwargs in case_endpoints(case_id):
        assert client.request(method, path, **kwargs).status_code == 200, path


# Sign-up and the account ---------------------------------------------------------------------------


def test_website_sign_up_as_a_specialist_is_pending(pending_specialist):
    me = pending_specialist.get("/api/auth/me").json()

    assert me["role"] == "specialist"
    assert me["specialist_status"] == "pending"
    assert me["approved_at"] is None


def test_a_pending_specialist_gets_a_clear_message(pending_specialist):
    body = assert_error(pending_specialist.get("/api/specialist/cases"), 403, "specialist_pending")

    assert "approval" in body["message"].lower()


def test_a_pending_specialist_can_sign_in_and_manage_their_account(make_client, pending_specialist):
    client = make_client()
    user = login(client, email=PENDING_EMAIL)
    assert user["specialist_status"] == "pending"

    renamed = client.patch("/api/account", json={"full_name": "Dr Huda Alqahtani"})
    assert renamed.status_code == 200
    assert renamed.json()["full_name"] == "Dr Huda Alqahtani"
    changed = client.post("/api/account/password", json={"current_password": PASSWORD, "new_password": "new-pass-123"})
    assert changed.status_code == 204
    assert client.get("/api/pests").status_code == 200


def test_a_pending_specialist_sees_no_case_or_grower_data(pending_specialist, case):
    assert_blocked(pending_specialist, case["id"])
    for path in (f"/api/specialist/cases/{case['id']}/claim", f"/api/specialist/cases/{case['id']}/questions"):
        assert_error(pending_specialist.post(path, json={"body": "A question"}), 403, "specialist_pending")


# The team's commands ---------------------------------------------------------------------------------


def test_create_specialist_makes_an_approved_account(app, settings, make_client, case, capsys):
    code = run(settings, "create-specialist", "--email", "noura@example.com", "--name", "Dr Noura", "--password", "specialist-pass")

    assert code == 0
    assert "approved" in capsys.readouterr().out
    client = make_client()
    assert login(client, email="noura@example.com", password="specialist-pass")["specialist_status"] == "approved"
    assert_allowed(client, case["id"])


def test_approve_then_revoke(settings, pending_specialist, case, capsys):
    assert_blocked(pending_specialist, case["id"])

    assert run(settings, "approve-specialist", "--email", PENDING_EMAIL) == 0
    assert "Approved specialist huda@example.com" in capsys.readouterr().out
    me = pending_specialist.get("/api/auth/me").json()
    assert me["specialist_status"] == "approved"
    assert me["approved_at"] is not None
    assert_allowed(pending_specialist, case["id"])
    assert [item["id"] for item in pending_specialist.get("/api/specialist/cases").json()] == [case["id"]]

    assert run(settings, "revoke-specialist", "--email", PENDING_EMAIL) == 0
    assert "pending again" in capsys.readouterr().out
    assert pending_specialist.get("/api/auth/me").json()["specialist_status"] == "pending"
    assert_blocked(pending_specialist, case["id"])


def test_approving_twice_is_harmless(settings, pending_specialist, capsys):
    run(settings, "approve-specialist", "--email", PENDING_EMAIL)
    capsys.readouterr()

    assert run(settings, "approve-specialist", "--email", "HUDA@example.com ") == 0
    assert "already approved" in capsys.readouterr().out


def test_list_pending_specialists_shows_names_and_emails_only(settings, db, pending_specialist, specialist, grower, capsys):
    assert run(settings, "list-pending-specialists") == 0
    out = capsys.readouterr().out

    assert "huda@example.com" in out and "Huda Alqahtani" in out
    assert "khalid@example.com" not in out  # approved
    assert "sara@example.com" not in out  # a grower
    password_hash = db.scalars(select(User.password_hash).where(User.email == PENDING_EMAIL)).one()
    assert PASSWORD not in out and password_hash not in out and "argon2" not in out

    run(settings, "approve-specialist", "--email", PENDING_EMAIL)
    capsys.readouterr()
    run(settings, "list-pending-specialists")
    assert "No specialist accounts are waiting" in capsys.readouterr().out


@pytest.mark.parametrize("command", ["approve-specialist", "revoke-specialist"])
def test_approval_commands_refuse_growers_and_unknown_emails(settings, grower, command, capsys):
    assert run(settings, command, "--email", "sara@example.com") == 1
    assert "not a specialist" in capsys.readouterr().err
    assert run(settings, command, "--email", "nobody@example.com") == 1
    assert "no account" in capsys.readouterr().err
    assert grower.get("/api/auth/me").json()["specialist_status"] is None


def test_revoking_keeps_the_specialist_s_cases_unless_released(settings, db, make_client, grower, case, capsys):
    client = make_client()
    register(client, email=PENDING_EMAIL, full_name="Huda Alqahtani", role="specialist")
    run(settings, "approve-specialist", "--email", PENDING_EMAIL)
    client.post(f"/api/specialist/cases/{case['id']}/claim")
    capsys.readouterr()

    run(settings, "revoke-specialist", "--email", PENDING_EMAIL)
    assert "still hold 1 open case" in capsys.readouterr().out
    db.expire_all()
    assert db.get(ReviewCase, case["id"]).specialist_id is not None

    run(settings, "revoke-specialist", "--email", PENDING_EMAIL, "--release-cases")
    assert "Returned their 1 open case(s) to the queue" in capsys.readouterr().out
    db.expire_all()
    assert db.get(ReviewCase, case["id"]).specialist_id is None


# Growers are unaffected --------------------------------------------------------------------------------


def test_growers_are_unaffected(settings, grower, case):
    me = grower.get("/api/auth/me").json()
    assert me["specialist_status"] is None
    assert me["approved_at"] is None
    assert grower.get("/api/plants").status_code == 200
    assert grower.get(f"/api/observations/{case['observation_id']}/review").status_code == 200
    # A grower is still told "forbidden" (wrong role), never "specialist_pending".
    assert_error(grower.get("/api/specialist/cases"), 403, "forbidden")


def test_a_revoked_specialist_s_notifications_are_hidden(settings, make_client, grower, case):
    client = make_client()
    register(client, email=PENDING_EMAIL, full_name="Huda Alqahtani", role="specialist")
    run(settings, "approve-specialist", "--email", PENDING_EMAIL)
    client.post(f"/api/specialist/cases/{case['id']}/questions", json={"body": "Is it sticky?"})
    grower.post(f"/api/reviews/{case['id']}/replies", json={"body": "Yes, very sticky."})
    assert client.get("/api/notifications").json()["unread"] == 1

    run(settings, "revoke-specialist", "--email", PENDING_EMAIL)

    assert client.get("/api/notifications").json() == {"unread": 0, "items": []}


def test_the_demo_specialist_is_approved(app, settings, make_client):
    assert run(settings, "seed-demo") == 0
    client = make_client()

    assert login(client, email="specialist@example.com", password=cli.DEMO_PASSWORD)["specialist_status"] == "approved"
    assert client.get("/api/specialist/cases").status_code == 200
