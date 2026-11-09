"""US18 tasks and in-app reminders, US19 dated personal notes."""

from datetime import date, timedelta

import pytest

from tests.helpers import add_observation, add_plant, assert_error

TODAY = date.today()
TASK_KEYS = {
    "id", "plant_id", "plant_name", "observation_id", "pest", "title", "notes", "due_on", "done", "done_at", "created_at",
}


@pytest.fixture
def lemon(grower):
    return add_plant(grower, "Lemon tree")


def add_task(client, plant_id, **fields):
    response = client.post(f"/api/plants/{plant_id}/tasks", json={"title": "Check the new shoots", **fields})
    assert response.status_code == 201, response.text
    return response.json()


def inbox(client, today=TODAY):
    return client.get(f"/api/notifications?today={today.isoformat()}").json()


# Tasks ---------------------------------------------------------------------------------------


def test_a_grower_adds_a_task_to_a_plant(grower, lemon):
    task = add_task(grower, lemon["id"], notes="Look under the leaves.", due_on=TODAY.isoformat())

    assert set(task) == TASK_KEYS
    assert task["plant_name"] == "Lemon tree"
    assert task["title"] == "Check the new shoots"
    assert task["due_on"] == TODAY.isoformat()
    assert task["done"] is False and task["done_at"] is None
    assert task["pest"] is None and task["observation_id"] is None


def test_a_task_can_come_from_an_observation_and_a_pest_guide(grower, lemon):
    observation = add_observation(grower, lemon["id"])

    task = add_task(grower, lemon["id"], observation_id=observation["id"], pest_key="aphids")

    assert task["observation_id"] == observation["id"]
    assert task["pest"] == {"key": "aphids", "name": "Aphids"}


@pytest.mark.parametrize(
    ("fields", "problem"),
    [
        ({"title": "  "}, {"title": "required"}),
        ({"title": "x" * 121}, {"title": "too_long"}),
        ({"pest_key": "ladybirds"}, {"pest_key": "invalid"}),
    ],
)
def test_task_details_are_checked(grower, lemon, fields, problem):
    response = grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check", **fields})

    assert_error(response, 422, "validation_error", problem)


def test_a_task_can_only_point_to_an_observation_of_the_same_plant(grower, lemon):
    fig = add_plant(grower, "Fig tree")
    elsewhere = add_observation(grower, fig["id"])

    response = grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Check", "observation_id": elsewhere["id"]})

    assert_error(response, 422, "validation_error", {"observation_id": "invalid"})


def test_open_tasks_are_listed_by_due_date_with_undated_ones_last(grower, lemon):
    fig = add_plant(grower, "Fig tree")
    later = add_task(grower, lemon["id"], title="Later", due_on=(TODAY + timedelta(days=5)).isoformat())
    undated = add_task(grower, fig["id"], title="Whenever")
    soon = add_task(grower, fig["id"], title="Soon", due_on=(TODAY + timedelta(days=1)).isoformat())
    done = add_task(grower, lemon["id"], title="Done already")
    grower.patch(f"/api/tasks/{done['id']}", json={"done": True})

    titles = [task["title"] for task in grower.get("/api/tasks?status=open").json()]
    assert titles == ["Soon", "Later", "Whenever"]
    assert [task["id"] for task in grower.get(f"/api/tasks?status=open&plant_id={fig['id']}").json()] == [
        soon["id"],
        undated["id"],
    ]
    assert [task["title"] for task in grower.get("/api/tasks?status=done").json()] == ["Done already"]
    assert len(grower.get("/api/tasks").json()) == 4
    assert later["id"]


def test_a_task_is_ticked_off_and_can_be_undone(grower, lemon):
    task = add_task(grower, lemon["id"])

    done = grower.patch(f"/api/tasks/{task['id']}", json={"done": True}).json()
    assert done["done"] is True and done["done_at"] is not None

    undone = grower.patch(f"/api/tasks/{task['id']}", json={"done": False}).json()
    assert undone["done"] is False and undone["done_at"] is None


def test_a_task_is_edited_and_deleted(grower, lemon):
    task = add_task(grower, lemon["id"])

    edited = grower.patch(f"/api/tasks/{task['id']}", json={"title": "Rinse the shoots", "notes": None, "due_on": None})
    assert edited.json()["title"] == "Rinse the shoots"

    assert grower.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert grower.get("/api/tasks").json() == []


def test_tasks_are_private(grower, other_grower, specialist, lemon):
    task = add_task(grower, lemon["id"])

    assert other_grower.get("/api/tasks").json() == []
    assert_error(other_grower.patch(f"/api/tasks/{task['id']}", json={"done": True}), 404, "not_found")
    assert_error(other_grower.delete(f"/api/tasks/{task['id']}"), 404, "not_found")
    assert_error(other_grower.post(f"/api/plants/{lemon['id']}/tasks", json={"title": "Mine"}), 404, "not_found")
    assert_error(specialist.get("/api/tasks"), 403, "forbidden")


def test_deleting_a_plant_removes_its_tasks(grower, lemon):
    add_task(grower, lemon["id"])

    grower.delete(f"/api/plants/{lemon['id']}")

    assert grower.get("/api/tasks").json() == []


# Reminders -------------------------------------------------------------------------------------


def test_a_task_that_comes_due_puts_one_reminder_in_the_bell(grower, lemon):
    task = add_task(grower, lemon["id"], title="Check the new shoots", due_on=TODAY.isoformat())

    first = inbox(grower)
    second = inbox(grower)

    assert first["unread"] == 1
    reminder = first["items"][0]
    assert reminder["kind"] == "task_due"
    assert reminder["task_id"] == task["id"]
    assert reminder["task_title"] == "Check the new shoots"
    assert reminder["plant_name"] == "Lemon tree"
    assert reminder["link"] == f"/plants/{lemon['id']}?tab=tasks"
    assert reminder["case_id"] is None
    assert second["unread"] == 1 and len(second["items"]) == 1


def test_overdue_tasks_remind_too_but_not_future_done_or_undated_ones(grower, lemon):
    add_task(grower, lemon["id"], title="Overdue", due_on=(TODAY - timedelta(days=3)).isoformat())
    add_task(grower, lemon["id"], title="Next week", due_on=(TODAY + timedelta(days=7)).isoformat())
    add_task(grower, lemon["id"], title="No date")
    finished = add_task(grower, lemon["id"], title="Finished", due_on=TODAY.isoformat())
    grower.patch(f"/api/tasks/{finished['id']}", json={"done": True})

    assert [item["task_title"] for item in inbox(grower)["items"]] == ["Overdue"]


def test_moving_the_due_date_reminds_again_when_it_comes(grower, lemon):
    task = add_task(grower, lemon["id"], due_on=TODAY.isoformat())
    inbox(grower)
    grower.post("/api/notifications/read-all")

    grower.patch(f"/api/tasks/{task['id']}", json={"due_on": (TODAY + timedelta(days=1)).isoformat()})
    assert inbox(grower)["unread"] == 0
    assert inbox(grower, TODAY + timedelta(days=1))["unread"] == 1


def test_the_browser_s_date_is_only_trusted_near_the_server_s(grower, lemon):
    add_task(grower, lemon["id"], due_on=(TODAY + timedelta(days=10)).isoformat())

    assert inbox(grower, TODAY + timedelta(days=10))["unread"] == 0


def test_deleting_a_task_removes_its_reminder(grower, lemon):
    task = add_task(grower, lemon["id"], due_on=TODAY.isoformat())
    inbox(grower)

    grower.delete(f"/api/tasks/{task['id']}")

    assert inbox(grower)["items"] == []


# Notes -------------------------------------------------------------------------------------------


def add_note(client, plant_id, **fields):
    response = client.post(
        f"/api/plants/{plant_id}/notes", json={"noted_on": TODAY.isoformat(), "body": "Rinsed the leaves.", **fields}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_a_grower_keeps_dated_notes_on_a_plant(grower, lemon):
    older = add_note(grower, lemon["id"], noted_on=(TODAY - timedelta(days=3)).isoformat(), body="Moved it into shade.")
    newer = add_note(grower, lemon["id"])

    assert set(newer) == {"id", "plant_id", "noted_on", "body", "created_at", "updated_at"}
    notes = grower.get(f"/api/plants/{lemon['id']}/notes").json()
    assert [note["id"] for note in notes] == [newer["id"], older["id"]]


def test_a_note_is_edited_and_deleted(grower, lemon):
    note = add_note(grower, lemon["id"])

    edited = grower.patch(f"/api/notes/{note['id']}", json={"body": "Rinsed the leaves twice."}).json()
    assert edited["body"] == "Rinsed the leaves twice."
    assert edited["noted_on"] == note["noted_on"]

    assert grower.delete(f"/api/notes/{note['id']}").status_code == 204
    assert grower.get(f"/api/plants/{lemon['id']}/notes").json() == []


@pytest.mark.parametrize(
    ("fields", "problem"),
    [
        ({"body": "   "}, {"body": "required"}),
        ({"noted_on": (TODAY + timedelta(days=2)).isoformat()}, {"noted_on": "future_date"}),
        ({"noted_on": "1999-12-31"}, {"noted_on": "too_early"}),
    ],
)
def test_note_details_are_checked(grower, lemon, fields, problem):
    response = grower.post(
        f"/api/plants/{lemon['id']}/notes", json={"noted_on": TODAY.isoformat(), "body": "Fine.", **fields}
    )
    assert_error(response, 422, "validation_error", problem)


def test_notes_are_private(grower, other_grower, specialist, lemon):
    note = add_note(grower, lemon["id"])

    assert_error(other_grower.get(f"/api/plants/{lemon['id']}/notes"), 404, "not_found")
    assert_error(other_grower.patch(f"/api/notes/{note['id']}", json={"body": "Mine"}), 404, "not_found")
    assert_error(other_grower.delete(f"/api/notes/{note['id']}"), 404, "not_found")
    assert_error(specialist.get(f"/api/plants/{lemon['id']}/notes"), 403, "forbidden")
