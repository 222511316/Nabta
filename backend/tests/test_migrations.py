"""The Alembic migrations build exactly the schema the models describe."""

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.db import Base

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["database_url"] = database_url
    return config


def test_upgrading_an_empty_database_matches_the_models(tmp_path):
    url = f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}"

    command.upgrade(alembic_config(url), "head")

    engine = create_engine(url)
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)
    engine.dispose()
    assert differences == []


def test_the_migrations_can_be_rolled_back(tmp_path):
    url = f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}"
    config = alembic_config(url)
    command.upgrade(config, "head")

    command.downgrade(config, "base")

    engine = create_engine(url)
    assert inspect(engine).get_table_names() == ["alembic_version"]
    engine.dispose()


# Upgrading databases that already hold records (supervisor review DEF-02) ---------------------------
#
# SQLite rebuilds a table to alter it. With foreign keys on, dropping the old `users` table during
# 0006_followup deleted every plant, observation and review (ON DELETE CASCADE). These tests fill a
# database at 0005_plant_reports (the Sprint 2 schema) with at least one row in every table and check
# that every row and every link survives the upgrade, a downgrade, and a second upgrade.

import sqlite3  # noqa: E402
from contextlib import closing  # noqa: E402

import pytest  # noqa: E402

from app import cli  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services import security  # noqa: E402
from tests.helpers import PASSWORD, login  # noqa: E402
from tests.images import jpeg  # noqa: E402

SPRINT2 = "0005_plant_reports"
SPRINT2_TABLES = [
    "users",
    "sessions",
    "password_reset_tokens",
    "plants",
    "observations",
    "analyses",
    "review_cases",
    "case_messages",
    "case_feedback",
    "notifications",
    "plant_reports",
]
T = "2026-10-01 09:00:00.000000"
LATER = "2026-12-31 09:00:00.000000"


def fill_sprint2_database(path, photos_dir):
    """At least one row in every Sprint 2 table, with every foreign key in use. Returns nothing;
    read the rows back with snapshot()."""
    password_hash = security.hash_password(PASSWORD)
    rows = [
        ("users", "id, email, full_name, password_hash, role, created_at, updated_at", [
            (1, "sara@example.com", "Sara Ahmed", password_hash, "grower", T, T),
            (2, "omar@example.com", "Omar Saleh", password_hash, "grower", T, T),
            (3, "khalid@example.com", "Khalid Alharbi", password_hash, "specialist", T, T),
            (4, "noura@example.com", "Noura Saad", password_hash, "specialist", T, T),
        ]),
        ("sessions", "id, user_id, token_hash, created_at, expires_at", [
            (1, 1, "a" * 64, T, LATER), (2, 3, "b" * 64, T, LATER),
        ]),
        ("password_reset_tokens", "id, user_id, token_hash, created_at, expires_at, used_at", [
            (1, 2, "c" * 64, T, LATER, None),
        ]),
        ("plants", "id, owner_id, name, plant_type, location, notes, created_at, updated_at", [
            (1, 1, "Lemon tree", "Lemon", "Back garden", "Planted in spring.", T, T),
            (2, 1, "Balcony tomatoes", "Tomato", None, None, T, T),
            (3, 2, "Fig tree", "Fig", "Courtyard", None, T, T),
        ]),
        ("observations", "id, plant_id, observed_on, notes, photo_filename, thumb_filename, photo_width, "
                         "photo_height, client_request_id, created_at", [
            (1, 1, "2026-09-20", "Green insects.", "obs1.jpg", "obs1_thumb.jpg", 800, 600, "req-1", T),
            (2, 2, "2026-09-21", None, "obs2.jpg", "obs2_thumb.jpg", 800, 600, None, T),
            (3, 3, "2026-09-22", "Hard bumps.", "obs3.jpg", "obs3_thumb.jpg", 800, 600, None, T),
        ]),
        ("analyses", "id, observation_id, outcome, category_key, confidence, predictions, model_version, "
                     "created_at, familiarity, unclear_reason", [
            (1, 1, "identified", "aphids", 0.91, '[{"key": "aphids", "name": "Aphids", "probability": 0.91}]',
             "nabta-pest-test", T, 0.8, None),
            (2, 2, "unclear", None, 0.41, '[{"key": "whiteflies", "name": "Whiteflies", "probability": 0.41}]',
             "nabta-pest-test", T, 0.2, "uncertain"),
        ]),
        ("review_cases", "id, observation_id, status, note, specialist_id, created_at, updated_at", [
            (1, 1, "answered", "Is this aphids?", 3, T, T),
            (2, 2, "waiting_for_grower", "What is this?", 3, T, T),
            (3, 3, "waiting_for_specialist", "Should I worry?", None, T, T),
        ]),
        ("case_messages", "id, case_id, author_id, kind, body, created_at", [
            (1, 1, 3, "question", "Are the leaves sticky?", T),
            (2, 1, 1, "reply", "Yes, very.", T),
            (3, 2, 3, "question", "Can you send a closer photo?", T),
        ]),
        ("case_feedback", "id, case_id, specialist_id, outcome, category_key, other_pest, message, created_at", [
            (1, 1, 3, "identified", "aphids", None, "These are aphids. Rinse them off.", T),
        ]),
        ("notifications", "id, user_id, kind, case_id, created_at, read_at", [
            (1, 1, "question_asked", 1, T, T),
            (2, 3, "grower_replied", 1, T, None),
            (3, 1, "feedback_sent", 1, T, None),
            (4, 1, "question_asked", 2, T, None),
        ]),
        ("plant_reports", "id, plant_id, content, model, created_at", [
            (1, 1, '{"summary": "Aphids once.", "timeline": [], "open_items": [], "next_steps": []}', "test-llm", T),
        ]),
    ]
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")  # every link must be real
        for table, columns, values in rows:
            marks = ", ".join("?" * len(values[0]))
            connection.executemany(f"INSERT INTO {table} ({columns}) VALUES ({marks})", values)
        connection.commit()
    photos_dir.mkdir(parents=True, exist_ok=True)
    for n in (1, 2, 3):
        (photos_dir / f"obs{n}.jpg").write_bytes(jpeg())
        (photos_dir / f"obs{n}_thumb.jpg").write_bytes(jpeg(size=(320, 240)))


def snapshot(path, tables=SPRINT2_TABLES, columns_from=None):
    """Every row of every table, by the columns the table had in `columns_from` (default: now)."""
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        reference = columns_from or {}
        result = {}
        for table in tables:
            columns = reference.get(table) or [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
            listed = ", ".join(columns)
            result[table] = connection.execute(f"SELECT {listed} FROM {table} ORDER BY id").fetchall()
        return result


def columns_of(path, tables=SPRINT2_TABLES):
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        return {table: [row[1] for row in connection.execute(f"PRAGMA table_info({table})")] for table in tables}


def foreign_key_problems(path):
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        return connection.execute("PRAGMA foreign_key_check").fetchall()


def revision_of(path):
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        return connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]


def table_names(path):
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}


@pytest.fixture
def sprint2_db(settings):
    """A database at the Sprint 2 revision with records in every table, and its photo files."""
    path = settings.database_url.removeprefix("sqlite:///")
    command.upgrade(alembic_config(settings.database_url), SPRINT2)
    fill_sprint2_database(path, settings.photos_dir)
    return path


def test_a_populated_sprint2_database_is_filled_in_every_table(sprint2_db):
    counts = {table: len(rows) for table, rows in snapshot(sprint2_db).items()}

    assert all(counts.values()), counts
    assert foreign_key_problems(sprint2_db) == []


def test_upgrading_a_populated_database_keeps_every_row_and_link(settings, sprint2_db):
    columns = columns_of(sprint2_db)
    before = snapshot(sprint2_db)

    command.upgrade(alembic_config(settings.database_url), "head")

    assert snapshot(sprint2_db, columns_from=columns) == before  # every row, every value, every link
    assert foreign_key_problems(sprint2_db) == []
    assert snapshot(sprint2_db, ["notes", "tasks"]) == {"notes": [], "tasks": []}  # new tables start empty
    with closing(sqlite3.connect(sprint2_db)) as connection:
        added = connection.execute("SELECT id, research_consent, approved_at FROM users ORDER BY id").fetchall()
        task_links = connection.execute("SELECT task_id FROM notifications").fetchall()
    assert added == [(1, 0, None), (2, 0, None), (3, 0, None), (4, 0, None)]  # specialists start pending
    assert task_links == [(None,)] * 4


def test_after_upgrading_the_app_shows_the_old_records_and_photos(settings, sprint2_db):
    from fastapi.testclient import TestClient

    command.upgrade(alembic_config(settings.database_url), "head")
    application = create_app(settings)
    try:
        with TestClient(application) as grower, TestClient(application) as specialist:
            with application.state.engine.connect() as connection:  # the app keeps foreign keys on
                assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1

            login(grower, email="sara@example.com")
            plants = {plant["name"]: plant for plant in grower.get("/api/plants").json()}
            assert set(plants) == {"Lemon tree", "Balcony tomatoes"}
            lemon = plants["Lemon tree"]
            observations = grower.get(f"/api/plants/{lemon['id']}/observations").json()
            assert [o["id"] for o in observations] == [1]
            for variant in ("", "?variant=thumb"):
                photo = grower.get(f"/api/observations/1/photo{variant}")
                assert photo.status_code == 200 and photo.content[:2] == b"\xff\xd8"  # a JPEG
            review = grower.get("/api/observations/1/review").json()
            assert review["status"] == "answered"
            assert [m["body"] for m in review["messages"]] == ["Are the leaves sticky?", "Yes, very."]
            assert review["feedback"]["specialist_name"] == "Khalid Alharbi"
            assert grower.get("/api/notifications").json()["unread"] == 2

            # Existing specialists start pending (Fix 2); once approved they find their cases again.
            login(specialist, email="khalid@example.com")
            assert_pending = specialist.get("/api/specialist/cases")
            assert assert_pending.status_code == 403
            assert cli.main(["approve-specialist", "--email", "khalid@example.com"], settings=settings) == 0
            queue = specialist.get("/api/specialist/cases").json()
            assert sorted(item["id"] for item in queue) == [1, 2, 3]
            assert specialist.get("/api/specialist/cases/2/photo").status_code == 200
    finally:
        application.state.engine.dispose()


def add_head_only_records(path):
    """Records only the newest schema can hold: a task with its reminder, a note, consent."""
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "INSERT INTO tasks (id, plant_id, observation_id, pest_key, title, due_on, created_at, updated_at) "
            "VALUES (1, 1, 1, 'aphids', 'Rinse the leaves', '2026-10-02', ?, ?)",
            (T, T),
        )
        connection.execute(
            "INSERT INTO notes (id, plant_id, noted_on, body, created_at, updated_at) VALUES (1, 1, '2026-10-01', 'Fed.', ?, ?)",
            (T, T),
        )
        connection.execute(
            "INSERT INTO notifications (id, user_id, kind, case_id, task_id, created_at) VALUES (5, 1, 'task_due', NULL, 1, ?)",
            (T,),
        )
        connection.execute("UPDATE users SET research_consent = 1, research_consent_at = ? WHERE id = 1", (T,))
        connection.execute("UPDATE users SET approved_at = ? WHERE id = 3", (T,))
        connection.commit()


def test_downgrading_to_sprint2_and_upgrading_again_keeps_the_sprint2_records(settings, sprint2_db):
    config = alembic_config(settings.database_url)
    columns = columns_of(sprint2_db)
    before = snapshot(sprint2_db)
    command.upgrade(config, "head")
    add_head_only_records(sprint2_db)

    command.downgrade(config, SPRINT2)

    assert revision_of(sprint2_db) == SPRINT2
    assert "tasks" not in table_names(sprint2_db) and "notes" not in table_names(sprint2_db)
    assert snapshot(sprint2_db) == before  # the Sprint 2 rows, exactly; task reminders went with the tasks
    assert foreign_key_problems(sprint2_db) == []

    command.upgrade(config, "head")

    assert snapshot(sprint2_db, columns_from=columns) == before
    assert foreign_key_problems(sprint2_db) == []


def test_an_upgrade_that_would_leave_broken_links_is_undone(settings, sprint2_db):
    """foreign_key_check runs before the upgrade is committed; if it finds anything, nothing changes."""
    with closing(sqlite3.connect(sprint2_db)) as connection:  # an orphan, possible only with foreign keys off
        connection.execute(
            "INSERT INTO plants (id, owner_id, name, created_at, updated_at) VALUES (99, 999, 'Orphan', ?, ?)", (T, T)
        )
        connection.commit()
    before = snapshot(sprint2_db)

    with pytest.raises(RuntimeError, match="Migration undone: 1 rows would point at missing records"):
        command.upgrade(alembic_config(settings.database_url), "head")

    assert revision_of(sprint2_db) == SPRINT2
    assert "tasks" not in table_names(sprint2_db)
    assert snapshot(sprint2_db) == before


# Backing up before an upgrade, and restoring (DEF-02) ------------------------------------------------


def test_backup_then_restore_puts_the_sprint2_database_back(settings, sprint2_db, tmp_path, capsys):
    before = snapshot(sprint2_db)

    assert cli.main(["backup-db", "--out", str(tmp_path / "backups")], settings=settings) == 0
    out = capsys.readouterr().out
    backups = list((tmp_path / "backups").glob(f"nabta-*-{SPRINT2}.db"))
    assert len(backups) == 1 and str(backups[0]) in out
    assert snapshot(backups[0]) == before
    assert PASSWORD not in out and "@example.com" not in out  # counts only, no personal data

    command.upgrade(alembic_config(settings.database_url), "head")
    assert revision_of(sprint2_db) == "0007_specialist_approval"

    assert cli.main(["restore-db", "--from", str(backups[0]), "--yes"], settings=settings) == 0
    assert "Restored" in capsys.readouterr().out
    assert revision_of(sprint2_db) == SPRINT2
    assert snapshot(sprint2_db) == before
    assert table_names(sprint2_db) == set(SPRINT2_TABLES) | {"alembic_version"}


def test_backup_if_upgrade_pending_skips_an_up_to_date_or_missing_database(settings, sprint2_db, tmp_path, capsys):
    out_dir = tmp_path / "backups"
    command.upgrade(alembic_config(settings.database_url), "head")

    assert cli.main(["backup-db", "--if-upgrade-pending", "--out", str(out_dir)], settings=settings) == 0
    assert "no backup needed" in capsys.readouterr().out
    assert not out_dir.exists()

    missing = settings.model_copy(update={"database_url": f"sqlite:///{(tmp_path / 'none.db').as_posix()}"})
    assert cli.main(["backup-db", "--if-upgrade-pending"], settings=missing) == 0
    assert "nothing to back up" in capsys.readouterr().out


def test_restore_refuses_without_confirmation(settings, sprint2_db, tmp_path, monkeypatch, capsys):
    cli.main(["backup-db", "--out", str(tmp_path / "b")], settings=settings)
    backup = next((tmp_path / "b").glob("*.db"))
    monkeypatch.setattr("builtins.input", lambda prompt="": "n")

    assert cli.main(["restore-db", "--from", str(backup)], settings=settings) == 1
    assert "Nothing was changed" in capsys.readouterr().err
