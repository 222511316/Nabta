"""US06: save a pest observation. Valid photos and notes retain the plant and date;
failed uploads can be retried (NFR09) without creating duplicates."""

import io
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Observation
from app.services import photos
from tests import images
from tests.helpers import add_observation, add_plant, assert_error, upload

OBSERVATION_KEYS = {
    "id",
    "plant_id",
    "plant_name",
    "observed_on",
    "notes",
    "photo_url",
    "thumb_url",
    "photo_width",
    "photo_height",
    "created_at",
}


@pytest.fixture
def plant(grower):
    return add_plant(grower, "Lemon tree")


def stored_files(settings):
    return sorted(path.name for path in settings.photos_dir.iterdir())


def fetch_photo(client, observation, variant="full"):
    response = client.get(f"/api/observations/{observation['id']}/photo", params={"variant": variant})
    assert response.status_code == 200, response.text
    return response


# Saving -----------------------------------------------------------------------


def test_a_photo_is_saved_with_its_plant_date_and_notes(grower, plant, settings):
    response = upload(grower, plant["id"], observed_on="2026-09-20", notes="  Small green insects  ")

    assert response.status_code == 201
    observation = response.json()
    assert set(observation) == OBSERVATION_KEYS
    assert observation["plant_id"] == plant["id"]
    assert observation["plant_name"] == "Lemon tree"
    assert observation["observed_on"] == "2026-09-20"
    assert observation["notes"] == "Small green insects"
    assert observation["photo_url"] == f"/api/observations/{observation['id']}/photo"
    assert observation["thumb_url"] == f"/api/observations/{observation['id']}/photo?variant=thumb"
    assert (observation["photo_width"], observation["photo_height"]) == (800, 600)
    assert len(stored_files(settings)) == 2


@pytest.mark.parametrize(
    ("photo", "filename", "content_type"),
    [
        (images.png(), "bug.png", "image/png"),
        (images.webp(), "bug.webp", "image/webp"),
        # The browser's label is not trusted either way: the bytes decide.
        (images.jpeg(), "bug.txt", "application/octet-stream"),
    ],
    ids=["png", "webp", "mislabelled jpeg"],
)
def test_png_webp_and_mislabelled_jpegs_are_accepted(grower, plant, photo, filename, content_type):
    response = upload(grower, plant["id"], photo, filename=filename, content_type=content_type)

    assert response.status_code == 201, response.text


def test_every_photo_is_stored_as_jpeg(grower, plant):
    observation = add_observation(grower, plant["id"], photo=images.png(mode="RGBA", color=(0, 0, 0, 0)))

    response = fetch_photo(grower, observation)

    assert response.headers["content-type"] == "image/jpeg"
    with Image.open(io.BytesIO(response.content)) as stored:
        assert stored.format == "JPEG"
        # Transparent areas become white rather than black.
        assert stored.convert("RGB").getpixel((10, 10)) == pytest.approx((255, 255, 255), abs=3)


@pytest.mark.parametrize(
    ("photo", "code"),
    [
        (b"just some text, not a photo", "unsupported_image_type"),
        (b"%PDF-1.7 not really a pdf", "unsupported_image_type"),
        (images.gif(), "unsupported_image_type"),
        (images.truncated_jpeg(), "invalid_image"),
        (images.jpeg(size=(255, 900)), "image_too_small"),
    ],
    ids=["text", "pdf", "gif", "truncated jpeg", "too small"],
)
def test_unusable_photos_are_refused_on_the_photo_field(grower, plant, settings, photo, code):
    response = upload(grower, plant["id"], photo)

    assert_error(response, 400, code, fields={"photo": code})
    assert stored_files(settings) == []


@pytest.mark.settings(max_upload_mb=1)
def test_a_photo_over_the_size_limit_is_refused(grower, plant, settings):
    oversized = images.jpeg() + b"\0" * (1024 * 1024)

    response = upload(grower, plant["id"], oversized)

    assert_error(response, 413, "image_too_large", fields={"photo": "image_too_large"})
    assert stored_files(settings) == []


def test_a_photo_over_the_pixel_limit_is_refused(grower, plant, monkeypatch):
    monkeypatch.setattr(photos, "MAX_PIXELS", 400_000)

    response = upload(grower, plant["id"], images.jpeg(size=(800, 600)))  # 480,000 pixels

    assert_error(response, 413, "image_too_large", fields={"photo": "image_too_large"})


def test_the_smallest_accepted_photo_is_256_pixels_on_its_shorter_side(grower, plant):
    assert upload(grower, plant["id"], images.jpeg(size=(256, 900))).status_code == 201


def test_a_missing_photo_is_a_validation_error(grower, plant):
    response = grower.post(f"/api/plants/{plant['id']}/observations", data={"observed_on": "2026-09-20"})

    assert_error(response, 422, "validation_error", fields={"photo": "required"})


# Dates and notes -----------------------------------------------------------------


def test_tomorrow_is_allowed_for_growers_ahead_of_utc(grower, plant):
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date().isoformat()

    assert upload(grower, plant["id"], observed_on=tomorrow).status_code == 201


@pytest.mark.parametrize(
    ("observed_on", "code"),
    [
        ((datetime.now(UTC) + timedelta(days=2)).date().isoformat(), "future_date"),
        ("1999-12-31", "too_early"),
        ("20-09-2026", "invalid"),
        ("", "required"),
    ],
)
def test_the_observation_date_is_checked(grower, plant, settings, observed_on, code):
    response = upload(grower, plant["id"], observed_on=observed_on)

    assert_error(response, 422, "validation_error", fields={"observed_on": code})
    assert stored_files(settings) == []


def test_notes_are_optional_and_blank_notes_are_not_stored(grower, plant):
    assert add_observation(grower, plant["id"], notes="   ")["notes"] is None


def test_notes_have_a_length_limit(grower, plant):
    response = upload(grower, plant["id"], notes="x" * 2001)

    assert_error(response, 422, "validation_error", fields={"notes": "too_long"})


# What is stored ------------------------------------------------------------------------


def test_phone_location_data_is_removed_and_rotation_applied(grower, plant):
    original = images.jpeg(size=(600, 400), exif=images.phone_exif(orientation=6))
    assert images.has_gps(original)  # the fixture really carries a location

    observation = add_observation(grower, plant["id"], photo=original)
    stored = fetch_photo(grower, observation).content

    assert not images.has_gps(stored)
    with Image.open(io.BytesIO(stored)) as image:
        assert dict(image.getexif()) == {}
        assert image.size == (400, 600)  # orientation 6 = rotate 90°: now portrait
    assert (observation["photo_width"], observation["photo_height"]) == (400, 600)


def test_large_photos_are_scaled_to_2560_pixels_and_get_a_480_pixel_thumbnail(grower, plant):
    observation = add_observation(grower, plant["id"], photo=images.jpeg(size=(3000, 2000)))

    assert (observation["photo_width"], observation["photo_height"]) == (2560, 1707)
    with Image.open(io.BytesIO(fetch_photo(grower, observation, "thumb").content)) as thumb:
        assert thumb.size == (480, 320)


def test_photos_are_served_privately(grower, plant):
    observation = add_observation(grower, plant["id"])

    response = fetch_photo(grower, observation)

    assert response.headers["cache-control"] == "private, max-age=3600"


def test_an_unknown_photo_variant_is_a_validation_error(grower, plant):
    observation = add_observation(grower, plant["id"])

    response = grower.get(f"/api/observations/{observation['id']}/photo", params={"variant": "huge"})

    assert_error(response, 422, "validation_error", fields={"variant": "invalid"})


# Retrying (NFR09) ---------------------------------------------------------------------


def test_retrying_with_the_same_request_id_returns_the_first_save(grower, plant, db, settings):
    first = upload(grower, plant["id"], client_request_id="3f1c9e2a-6b7d-4c1e-9a55-0d2b8e7f4a10")
    retry = upload(grower, plant["id"], client_request_id="3f1c9e2a-6b7d-4c1e-9a55-0d2b8e7f4a10")

    assert first.status_code == 201
    assert retry.status_code == 200
    assert retry.json() == first.json()
    assert db.scalar(select(func.count()).select_from(Observation)) == 1
    assert len(stored_files(settings)) == 2


def test_different_request_ids_are_different_observations(grower, plant):
    upload(grower, plant["id"], client_request_id="request-one-1234")
    second = upload(grower, plant["id"], client_request_id="request-two-5678")

    assert second.status_code == 201


def test_a_request_id_belonging_to_another_grower_is_a_conflict(grower, other_grower, plant):
    upload(grower, plant["id"], client_request_id="shared-request-id")
    omars_plant = add_plant(other_grower, "Omar's fig")

    response = upload(other_grower, omars_plant["id"], client_request_id="shared-request-id")

    assert_error(response, 409, "duplicate_request")


@pytest.mark.parametrize("request_id", ["short", "has spaces in it", "x" * 65, "bad_char$ids"])
def test_malformed_request_ids_are_refused(grower, plant, request_id):
    response = upload(grower, plant["id"], client_request_id=request_id)

    assert_error(response, 422, "validation_error", fields={"client_request_id": "invalid"})


def test_no_files_are_left_behind_when_saving_to_the_database_fails(app, grower, plant, settings, monkeypatch):
    def failing_commit(self):
        raise RuntimeError("disk full")

    monkeypatch.setattr(Session, "commit", failing_commit)
    client = TestClient(app, cookies=grower.cookies, raise_server_exceptions=False)

    response = upload(client, plant["id"])

    assert_error(response, 500, "server_error")
    assert stored_files(settings) == []


# Reading ------------------------------------------------------------------------------


def test_a_plant_s_observations_are_listed_newest_sighting_first(grower, plant):
    older = add_observation(grower, plant["id"], observed_on="2026-09-01")
    newest = add_observation(grower, plant["id"], observed_on="2026-09-15")
    same_day_later = add_observation(grower, plant["id"], observed_on="2026-09-15")

    listed = grower.get(f"/api/plants/{plant['id']}/observations").json()

    assert [item["id"] for item in listed] == [same_day_later["id"], newest["id"], older["id"]]


def test_an_observation_can_be_opened(grower, plant):
    observation = add_observation(grower, plant["id"])

    response = grower.get(f"/api/observations/{observation['id']}")

    assert response.status_code == 200
    assert response.json() == observation


def test_other_growers_observations_and_photos_are_invisible(grower, other_grower, plant):
    observation = add_observation(grower, plant["id"])

    for path in (
        f"/api/observations/{observation['id']}",
        f"/api/observations/{observation['id']}/photo",
        f"/api/observations/{observation['id']}/photo?variant=thumb",
        f"/api/plants/{plant['id']}/observations",
    ):
        assert_error(other_grower.get(path), 404, "not_found")
    assert_error(upload(other_grower, plant["id"]), 404, "not_found")
