"""US05: manage plant profiles; US07: the dashboard lists owned plants with summaries."""

import pytest
from sqlalchemy import func, select

from app.models import Observation
from tests.helpers import add_observation, add_plant, assert_error

PLANT_KEYS = {
    "id",
    "name",
    "plant_type",
    "location",
    "notes",
    "created_at",
    "updated_at",
    "observation_count",
    "last_observed_on",
    "cover_photo_url",
}


def test_a_grower_adds_a_plant(grower):
    response = grower.post(
        "/api/plants",
        json={"name": "  Lemon tree ", "plant_type": "Lemon", "location": "   ", "notes": ""},
    )

    assert response.status_code == 201
    plant = response.json()
    assert set(plant) == PLANT_KEYS
    assert plant["name"] == "Lemon tree"
    assert plant["plant_type"] == "Lemon"
    assert plant["location"] is None  # blank means "not set"
    assert plant["notes"] is None
    assert plant["observation_count"] == 0
    assert plant["last_observed_on"] is None
    assert plant["cover_photo_url"] is None


@pytest.mark.parametrize(
    ("payload", "fields"),
    [
        ({}, {"name": "required"}),
        ({"name": "   "}, {"name": "required"}),
        ({"name": "x" * 81}, {"name": "too_long"}),
        ({"name": 42}, {"name": "invalid"}),
        ({"name": "Rose", "plant_type": "x" * 81}, {"plant_type": "too_long"}),
        ({"name": "Rose", "location": "x" * 121}, {"location": "too_long"}),
        ({"name": "Rose", "notes": "x" * 1001}, {"notes": "too_long"}),
    ],
)
def test_invalid_plant_details_are_reported_per_field(grower, payload, fields):
    assert_error(grower.post("/api/plants", json=payload), 422, "validation_error", fields=fields)


def test_the_longest_allowed_values_are_accepted(grower):
    response = grower.post(
        "/api/plants",
        json={"name": "x" * 80, "plant_type": "x" * 80, "location": "x" * 120, "notes": "x" * 1000},
    )

    assert response.status_code == 201


def test_a_grower_opens_their_plant(grower):
    plant = add_plant(grower)

    response = grower.get(f"/api/plants/{plant['id']}")

    assert response.status_code == 200
    assert response.json() == plant


def test_the_plant_list_holds_only_the_grower_s_own_plants(grower, other_grower):
    add_plant(grower, "Lemon tree")
    add_plant(other_grower, "Omar's fig")

    names = [plant["name"] for plant in grower.get("/api/plants").json()]

    assert names == ["Lemon tree"]


def test_the_plant_summary_counts_observations_and_shows_the_latest_photo(grower):
    plant = add_plant(grower)
    newest = add_observation(grower, plant["id"], observed_on="2026-09-10")
    add_observation(grower, plant["id"], observed_on="2026-09-01")  # saved later, seen earlier

    summary = grower.get("/api/plants").json()[0]

    assert summary["observation_count"] == 2
    assert summary["last_observed_on"] == "2026-09-10"
    assert summary["cover_photo_url"] == newest["thumb_url"]
    assert grower.get(f"/api/plants/{plant['id']}").json() == summary


def test_plants_are_listed_with_the_most_recent_activity_first(grower):
    lemon = add_plant(grower, "Lemon tree")
    add_plant(grower, "Tomatoes")
    add_plant(grower, "Rose")
    add_observation(grower, lemon["id"])

    names = [plant["name"] for plant in grower.get("/api/plants").json()]

    assert names == ["Lemon tree", "Rose", "Tomatoes"]


def test_editing_changes_only_the_fields_sent(grower):
    plant = add_plant(grower, "Lemon tree", plant_type="Lemon", location="Back garden", notes="Old note")

    response = grower.patch(
        f"/api/plants/{plant['id']}", json={"name": "Lemon tree by the gate", "location": "", "notes": None}
    )

    assert response.status_code == 200
    edited = response.json()
    assert edited["name"] == "Lemon tree by the gate"
    assert edited["plant_type"] == "Lemon"
    assert edited["location"] is None
    assert edited["notes"] is None
    assert edited["updated_at"] >= plant["updated_at"]
    assert grower.get(f"/api/plants/{plant['id']}").json() == edited


@pytest.mark.parametrize("name", [None, "", "   "])
def test_a_plant_name_cannot_be_removed(grower, name):
    plant = add_plant(grower)

    response = grower.patch(f"/api/plants/{plant['id']}", json={"name": name})

    assert_error(response, 422, "validation_error", fields={"name": "required"})


def test_deleting_a_plant_removes_its_observations_and_photo_files(grower, db, settings):
    plant = add_plant(grower)
    add_observation(grower, plant["id"])
    add_observation(grower, plant["id"])
    assert len(list(settings.photos_dir.iterdir())) == 4  # two photos, two thumbnails

    response = grower.delete(f"/api/plants/{plant['id']}")

    assert response.status_code == 204
    assert_error(grower.get(f"/api/plants/{plant['id']}"), 404, "not_found")
    assert db.scalar(select(func.count()).select_from(Observation)) == 0
    assert list(settings.photos_dir.iterdir()) == []


def test_deleting_still_works_when_a_photo_file_is_already_missing(grower, settings):
    plant = add_plant(grower)
    add_observation(grower, plant["id"])
    next(settings.photos_dir.iterdir()).unlink()

    assert grower.delete(f"/api/plants/{plant['id']}").status_code == 204


def test_other_growers_plants_are_invisible_not_forbidden(grower, other_grower):
    plant = add_plant(other_grower, "Omar's fig")

    for response in (
        grower.get(f"/api/plants/{plant['id']}"),
        grower.patch(f"/api/plants/{plant['id']}", json={"name": "Mine now"}),
        grower.delete(f"/api/plants/{plant['id']}"),
    ):
        assert_error(response, 404, "not_found")
    assert other_grower.get(f"/api/plants/{plant['id']}").json()["name"] == "Omar's fig"


def test_an_unknown_plant_id_is_not_found(grower):
    assert_error(grower.get("/api/plants/999"), 404, "not_found")
