"""US21: search and filters across a grower's records, and dashboard summaries."""

from datetime import date, timedelta

import pytest

from tests.fakes import FakeClassifier
from tests.helpers import add_observation, add_plant, assert_error

TODAY = date.today()


@pytest.fixture
def records(app, grower, specialist):
    """Sara's garden: two plants, observations (one aphids, one unclear), tasks and a note."""
    lemon = add_plant(grower, "Lemon tree", plant_type="Lemon", location="Back garden")
    fig = add_plant(grower, "Fig tree", plant_type="Fig")
    app.state.classifier = FakeClassifier(probabilities=(0.9, 0.06, 0.04))
    aphids = add_observation(grower, lemon["id"], notes="Green insects on the shoots")
    grower.post(f"/api/observations/{aphids['id']}/analysis")
    app.state.classifier = FakeClassifier(probabilities=(0.4, 0.35, 0.25))
    unclear = add_observation(grower, fig["id"], notes="White cottony clumps")
    grower.post(f"/api/observations/{unclear['id']}/analysis")
    grower.post(
        f"/api/plants/{lemon['id']}/tasks",
        json={"title": "Rinse the aphids off", "due_on": (TODAY - timedelta(days=1)).isoformat()},
    )
    grower.post(f"/api/plants/{fig['id']}/tasks", json={"title": "Water the fig", "due_on": TODAY.isoformat()})
    grower.post(f"/api/plants/{fig['id']}/notes", json={"noted_on": TODAY.isoformat(), "body": "Pruned the lower branches."})
    return {"lemon": lemon, "fig": fig, "aphids": aphids, "unclear": unclear}


def search(client, **params):
    response = client.get("/api/search", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_search_looks_through_plants_observations_tasks_and_notes(grower, records):
    found = search(grower, q="fig")
    assert [plant["name"] for plant in found["plants"]] == ["Fig tree"]
    assert [task["title"] for task in found["tasks"]] == ["Water the fig"]  # by its plant
    assert [o["id"] for o in found["observations"]] == [records["unclear"]["id"]]

    assert [n["body"] for n in search(grower, q="PRUNED")["notes"]] == ["Pruned the lower branches."]
    assert [o["notes"] for o in search(grower, q="cottony")["observations"]] == ["White cottony clumps"]


def test_observations_are_found_by_the_pest_nabta_suggested(grower, records):
    found = search(grower, q="aphids")

    assert [o["id"] for o in found["observations"]] == [records["aphids"]["id"]]
    assert found["observations"][0]["result"] == {"outcome": "identified", "pest": {"key": "aphids", "name": "Aphids"}}
    assert [task["title"] for task in found["tasks"]] == ["Rinse the aphids off"]


def test_filters_narrow_the_results(grower, records):
    only_tasks = search(grower, type="tasks")
    assert set(only_tasks) == {"plants", "observations", "tasks", "notes"}
    assert only_tasks["plants"] == [] and only_tasks["notes"] == [] and len(only_tasks["tasks"]) == 2

    unclear = search(grower, type="observations", result="unclear")
    assert [o["id"] for o in unclear["observations"]] == [records["unclear"]["id"]]

    task = only_tasks["tasks"][0]
    grower.patch(f"/api/tasks/{task['id']}", json={"done": True})
    assert [t["id"] for t in search(grower, type="tasks", task_status="done")["tasks"]] == [task["id"]]
    assert len(search(grower, type="tasks", task_status="open")["tasks"]) == 1


def test_search_only_sees_the_grower_s_own_records(other_grower, records, specialist):
    assert search(other_grower, q="fig") == {"plants": [], "observations": [], "tasks": [], "notes": []}
    assert_error(specialist.get("/api/search", params={"q": "fig"}), 403, "forbidden")


def test_bad_filters_are_refused(grower):
    assert_error(grower.get("/api/search", params={"type": "photos"}), 422, "validation_error", {"type": "invalid"})


def test_the_dashboard_summary_counts_what_needs_attention(grower, specialist, records):
    case = grower.post(f"/api/observations/{records['aphids']['id']}/review", json={"note": "Sure?"}).json()
    specialist.post(f"/api/specialist/cases/{case['id']}/questions", json={"body": "Any ants?"})

    summary = grower.get("/api/summary", params={"today": TODAY.isoformat()}).json()

    assert summary == {
        "tasks_overdue": 1,
        "tasks_due_today": 1,
        "reviews_waiting_for_you": 1,
        "unclear_not_reviewed": 1,
        "open_tasks": 2,
    }
