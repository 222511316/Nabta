"""US11: reference examples for the suggested pest, with their source and review status (NFR14)."""

import json
import re
from datetime import date
from pathlib import Path

import pytest

from app.pests import load_catalog
from tests.helpers import assert_error

ML_CATEGORIES = Path(__file__).resolve().parents[2] / "ml" / "categories.yaml"

SUMMARY_KEYS = {"key", "name", "summary", "image_url", "review_status"}
DETAIL_KEYS = {
    "key",
    "name",
    "summary",
    "look_for",
    "size",
    "where",
    "damage",
    "look_alikes",
    "sources",
    "review",
    "images",
}


@pytest.fixture
def catalog(grower):
    response = grower.get("/api/pests")
    assert response.status_code == 200, response.text
    return response.json()


def test_the_catalog_lists_every_pest_nabta_identifies(catalog):
    assert [pest["key"] for pest in catalog] == [
        "aphids",
        "whiteflies",
        "mealybugs",
        "scale_insects",
        "fruit_flies",
        "armyworms_cutworms",
        "thrips",
        "locusts",
    ]
    aphids = catalog[0]
    assert set(aphids) == SUMMARY_KEYS
    assert aphids["name"] == "Aphids"
    assert aphids["summary"]
    assert aphids["image_url"] == "/api/pests/aphids/images/aphids-1.jpg"
    assert aphids["review_status"] == "awaiting_review"


def test_the_catalog_matches_the_model_s_categories():
    """The model is trained on ml/categories.yaml; every category it can suggest needs a page."""
    model_keys = re.findall(r"^\s*- key: (\w+)", ML_CATEGORIES.read_text(encoding="utf-8"), re.MULTILINE)

    assert [pest.key for pest in load_catalog().pests] == model_keys


def test_a_pest_page_describes_the_pest_and_cites_its_source(grower):
    response = grower.get("/api/pests/aphids")

    assert response.status_code == 200
    pest = response.json()
    assert set(pest) == DETAIL_KEYS
    assert pest["name"] == "Aphids"
    assert len(pest["look_for"]) >= 2
    assert pest["where"] and pest["damage"] and pest["look_alikes"]
    assert pest["sources"] == [
        {
            "title": "Aphids",
            "publisher": "UC Statewide IPM Program (UC IPM)",
            "url": "https://ipm.ucanr.edu/home-and-landscape/aphids/",
        }
    ]


def test_content_shows_it_still_awaits_specialist_review(grower):
    pest = grower.get("/api/pests/thrips").json()

    assert pest["review"] == {"status": "awaiting_review", "reviewed_by": None, "reviewed_on": None}


def test_reference_photos_have_captions_and_credit_the_dataset(grower):
    images = grower.get("/api/pests/whiteflies").json()["images"]

    assert images[0] == {
        "url": "/api/pests/whiteflies/images/whiteflies-1.jpg",
        "caption": "Adult: yellowish body and white, waxy wings",
        "credit": "IP102 dataset (Wu et al., CVPR 2019), class 72",
    }


def test_size_is_left_out_when_the_source_gives_none(grower):
    assert grower.get("/api/pests/locusts").json()["size"] is None


def test_every_pest_has_a_source_and_three_or_four_photos_that_load(grower, catalog):
    for summary in catalog:
        pest = grower.get(f"/api/pests/{summary['key']}").json()
        assert pest["sources"], pest["key"]
        assert all(source["url"].startswith("https://") for source in pest["sources"])
        assert 3 <= len(pest["images"]) <= 4, pest["key"]
        for image in pest["images"]:
            response = grower.get(image["url"])
            assert response.status_code == 200, image["url"]
            assert response.headers["content-type"] == "image/jpeg"
            assert response.content[:3] == b"\xff\xd8\xff"


def test_specialists_can_read_the_reference_too(specialist):
    assert specialist.get("/api/pests").status_code == 200
    assert specialist.get("/api/pests/mealybugs").status_code == 200
    assert specialist.get("/api/pests/mealybugs/images/mealybugs-1.jpg").status_code == 200


def test_an_unknown_pest_is_not_found(grower):
    assert_error(grower.get("/api/pests/ladybirds"), 404, "not_found")
    assert_error(grower.get("/api/pests/ladybirds/images/aphids-1.jpg"), 404, "not_found")


@pytest.mark.parametrize(
    "filename",
    [
        "whiteflies-1.jpg",  # another pest's photo
        "aphids-9.jpg",  # not listed
        "catalog.json",
        "..%2Fcatalog.json",
        "..%5Ccatalog.json",
    ],
)
def test_only_the_pest_s_own_listed_photos_are_served(grower, filename):
    assert_error(grower.get(f"/api/pests/aphids/images/{filename}"), 404, "not_found")


def _entry(**overrides):
    entry = {
        "key": "aphids",
        "name": "Aphids",
        "summary": "Small sap-sucking insects.",
        "look_for": ["Pear-shaped bodies", "Cornicles"],
        "where": "Leaves and stems.",
        "damage": "Yellow leaves.",
        "look_alikes": "Leafhoppers.",
        "sources": [{"title": "Aphids", "publisher": "UC IPM", "url": "https://ipm.ucanr.edu/"}],
        "review": {"status": "awaiting_review", "reviewed_by": None, "reviewed_on": None},
        "images": [{"file": "aphids-1.jpg", "caption": "Close-up", "credit": "IP102"}],
    }
    return {**entry, **overrides}


def _content(tmp_path, entry):
    (tmp_path / "images").mkdir()
    (tmp_path / "images" / "aphids-1.jpg").write_bytes(b"\xff\xd8\xff")
    (tmp_path / "catalog.json").write_text(json.dumps({"pests": [entry]}), encoding="utf-8")
    return tmp_path


def test_reviewed_content_records_who_reviewed_it_and_when(tmp_path):
    review = {"status": "reviewed", "reviewed_by": "Khalid Alharbi", "reviewed_on": "2026-10-20"}

    pest = load_catalog(_content(tmp_path, _entry(review=review))).get("aphids")

    assert pest.review.reviewed_by == "Khalid Alharbi"
    assert pest.review.reviewed_on == date(2026, 10, 20)


@pytest.mark.parametrize(
    ("overrides", "problem"),
    [
        ({"sources": []}, "aphids: no source"),
        ({"review": {"status": "checked", "reviewed_by": None, "reviewed_on": None}}, "unknown review status"),
        ({"review": {"status": "reviewed", "reviewed_by": None, "reviewed_on": None}}, "reviewed without a reviewer"),
        ({"images": [{"file": "aphids-2.jpg", "caption": "x", "credit": "x"}]}, "missing photo 'aphids-2.jpg'"),
        ({"images": [{"file": "../catalog.json", "caption": "x", "credit": "x"}]}, "missing photo"),
    ],
)
def test_broken_content_stops_the_app_from_starting(tmp_path, overrides, problem):
    with pytest.raises(ValueError, match=re.escape(problem)):
        load_catalog(_content(tmp_path, _entry(**overrides)))
