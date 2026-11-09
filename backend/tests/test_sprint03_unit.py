"""Sprint 03 unit tests (UT-01 to UT-09): single backend functions called directly, checked against
the Project Charter's US17-US22 (Section 16.3) and FR17-FR22.

No HTTP request, database or model is involved. Where a function needs a database session, a
catalogue or a record, a small stub stands in for it; the stubs are named in each test.
UT-07 reads the real pest catalogue file (content only, no database).
"""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.errors import ApiError
from app.pests import load_catalog
from app.schemas.followup import NoteIn, TaskIn, TaskPatch
from app.services import followup, notifications, photos, search
from app.services.observations import check_date


def server_today() -> date:
    return datetime.now(UTC).date()


class StubSession:
    """Records what a service does with the session, without a database."""

    def __init__(self):
        self.added, self.executed, self.commits, self.refreshed = [], [], 0, []

    def add(self, obj):
        self.added.append(obj)

    def execute(self, statement):
        self.executed.append(statement)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshed.append(obj)


# UT-01 -------------------------------------------------------------------------------------------


def test_ut01_reminder_day_trusts_the_browser_date_only_within_one_day():
    """US18, FR17. Derived condition: due reminders use the grower's own calendar day, but a
    browser date more than one day from the server's is ignored."""
    today = server_today()
    assert followup.trusted_today(None) == today
    assert followup.trusted_today(today) == today
    assert followup.trusted_today(today + timedelta(days=1)) == today + timedelta(days=1)  # boundary
    assert followup.trusted_today(today - timedelta(days=1)) == today - timedelta(days=1)  # boundary
    assert followup.trusted_today(today + timedelta(days=2)) == today  # outside: server date used
    assert followup.trusted_today(today - timedelta(days=30)) == today


# UT-02 -------------------------------------------------------------------------------------------


def test_ut02_due_and_overdue_counts_at_the_day_boundary():
    """US18, US21, FR20. Derived condition: the summary counts open dated tasks as overdue
    (before today) or due today; done and undated tasks are not counted."""
    today = date(2026, 11, 3)
    task = lambda due, done=None: SimpleNamespace(due_on=due, done_at=done)  # noqa: E731
    tasks = [
        task(date(2026, 11, 2)),  # overdue (yesterday)
        task(date(2026, 11, 3)),  # due today
        task(date(2026, 11, 3)),  # due today
        task(date(2026, 11, 4)),  # tomorrow: neither
        task(date(2026, 11, 1), done=datetime(2026, 11, 2, tzinfo=UTC)),  # done: not counted
        task(None),  # undated: not counted
    ]
    assert followup.counts_for_today(tasks, today) == (1, 2)
    assert followup.counts_for_today([], today) == (0, 0)


# UT-03 -------------------------------------------------------------------------------------------


def test_ut03_moving_a_due_date_resets_the_reminder_and_done_can_be_undone():
    """US18, FR17. Charter criterion: plant-linked tasks can be completed. Derived condition: a
    new due date earns a new reminder; ticking done twice keeps the first completion time."""
    db = StubSession()  # stub: no database
    task = SimpleNamespace(id=5, title="Check shoots", notes=None, due_on=date(2026, 11, 3),
                           reminded_at=datetime(2026, 11, 3, tzinfo=UTC), done_at=None)

    followup.update_task(db, task, TaskPatch(due_on=date(2026, 11, 3)))  # same date
    assert task.reminded_at is not None and db.executed == []

    followup.update_task(db, task, TaskPatch(due_on=date(2026, 11, 10)))  # new date
    assert task.due_on == date(2026, 11, 10) and task.reminded_at is None
    assert len(db.executed) == 1 and "DELETE FROM notifications" in str(db.executed[0])

    followup.update_task(db, task, TaskPatch(done=True))
    first_done = task.done_at
    assert first_done is not None
    followup.update_task(db, task, TaskPatch(done=True))
    assert task.done_at == first_done
    followup.update_task(db, task, TaskPatch(done=False))
    assert task.done_at is None
    assert db.commits == 5


# UT-04 -------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("fields", "accepted"),
    [
        ({"title": "Rinse aphids off"}, True),
        ({"title": "x" * 120}, True),  # boundary: maximum length
        ({"title": "x" * 121}, False),  # one over
        ({"title": "   "}, False),  # blank after trimming
        ({"title": ""}, False),
        ({"title": "Ok", "notes": "n" * 1000}, True),
        ({"title": "Ok", "notes": "n" * 1001}, False),
        ({"title": "Ok", "due_on": "2026-13-01"}, False),  # not a date
    ],
)
def test_ut04_task_fields_are_validated(fields, accepted):
    """US18, FR17. Derived condition: a task needs a title of 1-120 characters, notes up to 1000
    and a valid calendar date when one is given."""
    if accepted:
        TaskIn(**fields)
    else:
        with pytest.raises(ValidationError):
            TaskIn(**fields)


# UT-05 -------------------------------------------------------------------------------------------


def test_ut05_note_dates_and_text_are_validated():
    """US19, FR18. Derived condition: a dated note needs text (1-2000 characters) and a date that
    has happened (tomorrow in UTC is allowed for UTC+3; nothing before 2000)."""
    today = server_today()
    check_date(today, "noted_on")
    check_date(today + timedelta(days=1), "noted_on")  # boundary
    check_date(date(2000, 1, 1), "noted_on")  # boundary
    with pytest.raises(ApiError) as future:
        check_date(today + timedelta(days=2), "noted_on")
    assert future.value.status_code == 422 and future.value.fields == {"noted_on": "future_date"}
    with pytest.raises(ApiError) as early:
        check_date(date(1999, 12, 31), "noted_on")
    assert early.value.fields == {"noted_on": "too_early"}

    NoteIn(noted_on=today, body="b" * 2000)
    for body in ("", "   ", "b" * 2001):
        with pytest.raises(ValidationError):
            NoteIn(noted_on=today, body=body)


# UT-06 -------------------------------------------------------------------------------------------


def test_ut06_a_task_cannot_point_to_another_plant_s_observation_or_an_unknown_pest():
    """US18, NFR08. Derived condition: a task links only to an observation of its own plant and to
    a supported pest guide; otherwise nothing is saved."""
    db = StubSession()  # stub session
    plant = SimpleNamespace(id=1, observations=[SimpleNamespace(id=10), SimpleNamespace(id=11)])  # stub plant
    catalog = {"aphids"}  # stub catalogue: supports `in`

    with pytest.raises(ApiError) as wrong_observation:
        followup.create_task(db, plant, TaskIn(title="Check", observation_id=99), catalog)
    assert wrong_observation.value.status_code == 422
    assert wrong_observation.value.fields == {"observation_id": "invalid"}

    with pytest.raises(ApiError) as wrong_pest:
        followup.create_task(db, plant, TaskIn(title="Check", pest_key="ladybirds"), catalog)
    assert wrong_pest.value.fields == {"pest_key": "invalid"}
    assert db.added == [] and db.commits == 0

    task = followup.create_task(db, plant, TaskIn(title="Check", observation_id=11, pest_key="aphids"), catalog)
    assert (task.plant_id, task.observation_id, task.pest_key) == (1, 11, "aphids")
    assert db.added == [task] and db.commits == 1


# UT-07 -------------------------------------------------------------------------------------------


def test_ut07_search_matches_pests_by_their_english_and_arabic_names():
    """US21, US23, FR20. Derived condition: records linked to a pest are found by the pest's name
    in either interface language; an unknown key adds no names."""
    catalog = load_catalog()  # the shipped content file; no database
    assert search._pest_names(catalog, "aphids") == ["Aphids", "المنّ"]
    assert search._pest_names(catalog, "ladybirds") == []
    assert search._pest_names(catalog, None) == []


# UT-08 -------------------------------------------------------------------------------------------


def test_ut08_deleting_photo_files_removes_only_the_named_files(tmp_path):
    """US22, NFR08. Derived condition: a deletion removes the record's photo and thumbnail files,
    leaves other files alone, and tolerates a file that is already gone."""
    for name in ("a.jpg", "a_thumb.jpg", "keep.jpg"):
        (tmp_path / name).write_bytes(b"x")
    photos.delete_files(tmp_path, ["a.jpg", "a_thumb.jpg", "missing.jpg"])
    assert sorted(p.name for p in tmp_path.iterdir()) == ["keep.jpg"]


# UT-09 -------------------------------------------------------------------------------------------


def test_ut09_a_due_reminder_names_the_task_and_opens_the_plant_s_tasks():
    """US18. Charter criterion: due reminders appear in the app. Derived condition: the reminder
    names the task and its plant and links to that plant's task list."""
    plant = SimpleNamespace(name="Lemon tree")
    task = SimpleNamespace(id=4, title="Rinse aphids off", plant=plant, plant_id=12)  # stub task
    reminder = SimpleNamespace(id=30, kind="task_due", task=task, read_at=None,
                               created_at=datetime(2026, 11, 3, 6, 0, tzinfo=UTC))  # stub notification
    out = notifications._out(reminder)
    assert (out.kind, out.task_id, out.task_title, out.plant_name) == ("task_due", 4, "Rinse aphids off", "Lemon tree")
    assert out.link == "/plants/12?tab=tasks"
    assert out.case_id is None and out.read is False
