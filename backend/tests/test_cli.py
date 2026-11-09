"""The team's command line: creating specialist accounts (US08) and demo data."""

import pytest
from sqlalchemy import select

from app import cli
from app.models import Plant, User
from tests.helpers import assert_error, login


def run(settings, *args):
    return cli.main(list(args), settings=settings)


def test_create_specialist_makes_an_account_that_opens_the_workspace(app, settings, make_client, capsys):
    code = run(settings, "create-specialist", "--email", "Noura@Example.com", "--name", "Dr Noura", "--password", "specialist-pass")

    assert code == 0
    assert "noura@example.com" in capsys.readouterr().out
    client = make_client()
    user = login(client, email="noura@example.com", password="specialist-pass")
    assert user["role"] == "specialist"
    assert client.get("/api/specialist/cases").status_code == 200


def test_create_specialist_asks_for_the_password_twice_when_not_given(app, settings, make_client, monkeypatch):
    answers = iter(["typed-password", "typed-password"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt="": next(answers))

    assert run(settings, "create-specialist", "--email", "noura@example.com", "--name", "Dr Noura") == 0
    login(make_client(), email="noura@example.com", password="typed-password")


def test_typed_passwords_that_differ_create_nothing(app, settings, db, monkeypatch, capsys):
    answers = iter(["first-password", "second-password"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt="": next(answers))

    assert run(settings, "create-specialist", "--email", "noura@example.com", "--name", "Dr Noura") == 1
    assert "do not match" in capsys.readouterr().err
    assert db.scalars(select(User)).all() == []


def test_an_existing_email_is_not_turned_into_a_specialist(grower, settings, capsys):
    code = run(settings, "create-specialist", "--email", "sara@example.com", "--name", "Sara", "--password", "specialist-pass")

    assert code == 1
    assert "already exists" in capsys.readouterr().err
    assert grower.get("/api/auth/me").json()["role"] == "grower"
    assert_error(grower.get("/api/specialist/cases"), 403, "forbidden")


@pytest.mark.parametrize(
    ("email", "name", "password", "problem"),
    [
        ("not-an-email", "Dr Noura", "specialist-pass", "email"),
        ("noura@example.com", "   ", "specialist-pass", "full_name"),
        ("noura@example.com", "Dr Noura", "short", "password"),
    ],
)
def test_invalid_details_are_explained(app, settings, db, capsys, email, name, password, problem):
    code = run(settings, "create-specialist", "--email", email, "--name", name, "--password", password)

    assert code == 1
    assert problem in capsys.readouterr().err
    assert db.scalars(select(User)).all() == []


def test_seed_demo_creates_the_demo_accounts_and_plants_only_once(app, settings, db, make_client):
    assert run(settings, "seed-demo") == 0
    assert run(settings, "seed-demo") == 0

    accounts = {user.email: user.role for user in db.scalars(select(User))}
    assert accounts == {"grower@example.com": "grower", "specialist@example.com": "specialist"}
    assert sorted(plant.name for plant in db.scalars(select(Plant))) == [
        "Balcony tomatoes",
        "Damask rose",
        "Lemon tree",
    ]
    login(make_client(), email="grower@example.com", password=cli.DEMO_PASSWORD)
    login(make_client(), email="specialist@example.com", password=cli.DEMO_PASSWORD)
