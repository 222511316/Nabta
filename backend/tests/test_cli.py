"""The team's command line: creating specialist accounts (US08), demo data and content review."""

import json
import shutil
from datetime import date

import pytest
from sqlalchemy import select

from app import cli
from app.models import Analysis, Notification, Observation, Plant, ReviewCase, User
from app.pests import CONTENT_DIR, Review, load_catalog
from tests.fakes import FakeClassifier
from tests.helpers import add_plant, assert_error, login


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
        "Fig tree",
        "Lemon tree",
        "Mint pot",
    ]
    login(make_client(), email="grower@example.com", password=cli.DEMO_PASSWORD)
    login(make_client(), email="specialist@example.com", password=cli.DEMO_PASSWORD)


def test_seed_demo_adds_photo_observations_the_grower_can_open(app, settings, db, make_client):
    assert run(settings, "seed-demo") == 0
    assert run(settings, "seed-demo") == 0  # a second run adds no duplicates

    observations = db.scalars(select(Observation)).all()
    assert len(observations) == 8
    assert len(list(settings.photos_dir.iterdir())) == 16  # photo + thumbnail each

    grower = make_client()
    login(grower, email="grower@example.com", password=cli.DEMO_PASSWORD)
    plants = {plant["name"]: plant for plant in grower.get("/api/plants").json()}
    assert plants["Lemon tree"]["observation_count"] == 3
    assert plants["Mint pot"]["observation_count"] == 1
    assert plants["Lemon tree"]["cover_photo_url"] is not None
    photo = grower.get(plants["Lemon tree"]["cover_photo_url"])
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/jpeg"


def test_seed_demo_fills_in_observations_for_an_earlier_seed(app, settings, db, monkeypatch):
    # Databases seeded before observations existed get them on the next run.
    monkeypatch.setattr(cli, "DEMO_OBSERVATIONS", [])
    run(settings, "seed-demo")
    monkeypatch.undo()

    run(settings, "seed-demo")

    assert len(db.scalars(select(Observation)).all()) == 8


def test_demo_photos_are_real_ip102_test_photos_with_credits():
    record = json.loads((cli.DEMO_DIR / "demo.json").read_text(encoding="utf-8"))

    assert "IP102" in record["credit"]
    for _, _, photo, _ in cli.DEMO_OBSERVATIONS:
        assert (cli.DEMO_DIR / photo).is_file(), photo
        assert record["photos"][photo]["split"] == "test"  # never a photo the model trained on


def test_seed_demo_opens_a_review_in_each_state(app, settings, db, make_client):
    assert run(settings, "seed-demo") == 0

    cases = {case.status: case for case in db.scalars(select(ReviewCase))}
    assert set(cases) == {"waiting_for_specialist", "waiting_for_grower", "answered"}
    specialist = db.scalar(select(User).where(User.email == "specialist@example.com"))
    assert cases["waiting_for_specialist"].specialist_id is None  # new, in the queue
    assert cases["waiting_for_grower"].specialist_id == specialist.id
    assert [m.kind for m in cases["waiting_for_grower"].messages] == ["question"]
    assert cases["answered"].feedback.category_key == "aphids"

    grower_inbox = make_client()
    login(grower_inbox, email="grower@example.com", password=cli.DEMO_PASSWORD)
    inbox = grower_inbox.get("/api/notifications").json()
    # The two review notices, and reminders for the overdue task and the one due today.
    assert inbox["unread"] == 4
    assert {item["kind"] for item in inbox["items"]} == {"question_asked", "feedback_sent", "task_due"}

    queue = make_client()
    login(queue, email="specialist@example.com", password=cli.DEMO_PASSWORD)
    assert len(queue.get("/api/specialist/cases").json()) == 3


def test_seed_demo_adds_tasks_in_each_state_and_notes(app, settings, make_client):
    assert run(settings, "seed-demo") == 0
    client = make_client()
    login(client, email="grower@example.com", password=cli.DEMO_PASSWORD)

    tasks = client.get("/api/tasks").json()
    assert len(tasks) == len(cli.DEMO_TASKS)
    assert sum(task["done"] for task in tasks) == 1
    from_guide = [task for task in tasks if task["pest"]]
    assert {task["pest"]["key"] for task in from_guide} == {"aphids", "whiteflies"}
    assert all(task["observation_id"] for task in from_guide)
    summary = client.get("/api/summary").json()
    assert summary["tasks_overdue"] == 1 and summary["tasks_due_today"] == 1

    lemon = next(plant for plant in client.get("/api/plants").json() if plant["name"] == "Lemon tree")
    assert len(client.get(f"/api/plants/{lemon['id']}/notes").json()) == 2


def test_seed_demo_runs_the_model_when_it_is_installed(app, settings, db, monkeypatch):
    monkeypatch.setattr(cli, "load_classifier", lambda model_dir: FakeClassifier())

    assert run(settings, "seed-demo") == 0

    analyses = db.scalars(select(Analysis)).all()
    assert len(analyses) == 8
    assert {analysis.model_version for analysis in analyses} == {"test-model-1"}


def test_seed_demo_without_a_model_leaves_identification_for_later(app, settings, db, monkeypatch):
    monkeypatch.setattr(cli, "load_classifier", lambda model_dir: None)

    assert run(settings, "seed-demo") == 0

    assert db.scalars(select(Analysis)).all() == []
    assert len(db.scalars(select(ReviewCase)).all()) == 3


def test_reset_replaces_only_the_demo_grower_s_data(app, settings, db, grower, capsys):
    own_plant = add_plant(grower, "Sara's own fig")  # another account's data must survive
    assert run(settings, "seed-demo") == 0
    old_photos = set(settings.photos_dir.iterdir())
    demo_grower = db.scalar(select(User).where(User.email == "grower@example.com"))
    old_files = set(db.scalars(select(Observation.photo_filename).join(Plant).where(Plant.owner_id == demo_grower.id)))

    assert run(settings, "seed-demo", "--reset") == 0

    db.expire_all()
    new_files = set(db.scalars(select(Observation.photo_filename).join(Plant).where(Plant.owner_id == demo_grower.id)))
    assert len(new_files) == 8 and not new_files & old_files
    assert len(db.scalars(select(ReviewCase)).all()) == 3
    assert len(db.scalars(select(Notification)).all()) == 2
    assert grower.get(f"/api/plants/{own_plant['id']}").status_code == 200
    photos_now = set(settings.photos_dir.iterdir())
    assert len(photos_now) == 16  # the new demo photos only
    assert not old_photos & photos_now  # the replaced ones were deleted
    assert "Removed the demo grower's" in capsys.readouterr().out


# Content review (NFR14) ------------------------------------------------------------------------


@pytest.fixture
def content(tmp_path, monkeypatch):
    """A copy of the pest content, so the real catalog is never changed by a test."""
    copy = tmp_path / "pests"
    shutil.copytree(CONTENT_DIR, copy)
    monkeypatch.setattr(cli, "CONTENT_DIR", copy)
    return copy


def test_review_content_records_the_reviewer_and_date(app, settings, content, capsys):
    assert run(settings, "review-content", "--by", "Dr Noura Saad", "--pest", "aphids", "--pest", "thrips") == 0

    catalog = load_catalog(content)
    assert catalog.get("aphids").review == Review("reviewed", "Dr Noura Saad", date.today())
    assert catalog.get("thrips").review.status == "reviewed"
    assert catalog.get("whiteflies").review.status == "awaiting_review"
    assert "Marked aphids, thrips as reviewed by Dr Noura Saad" in capsys.readouterr().out


def test_review_content_can_sign_off_every_page_or_the_arabic_translation(app, settings, content):
    assert run(settings, "review-content", "--by", "Dr Noura Saad", "--all") == 0
    assert run(settings, "review-content", "--by", "Rema Altamimi", "--translation", "ar") == 0

    catalog = load_catalog(content)
    assert all(pest.review.status == "reviewed" for pest in catalog.pests)
    assert catalog.get("aphids", "ar").translation.status == "reviewed"
    raw = json.loads((content / "catalog.json").read_text(encoding="utf-8"))
    assert raw["translations"]["ar"]["reviewed_by"] == "Rema Altamimi"


def test_review_content_refuses_unknown_pests_and_blank_names(app, settings, content, capsys):
    before = (content / "catalog.json").read_text(encoding="utf-8")

    assert run(settings, "review-content", "--by", "Dr Noura", "--pest", "ladybirds") == 1
    assert "Known: aphids" in capsys.readouterr().err
    assert run(settings, "review-content", "--by", "  ", "--all") == 1
    assert (content / "catalog.json").read_text(encoding="utf-8") == before
