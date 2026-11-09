"""Deployment: the API serves the built frontend, and the app's own routes reach index.html."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import assert_error

INDEX = "<!doctype html><title>Nabta</title><div id=root></div>"


@pytest.fixture
def dist(tmp_path):
    folder = tmp_path / "dist"
    (folder / "assets").mkdir(parents=True)
    (folder / "index.html").write_text(INDEX, encoding="utf-8")
    (folder / "assets" / "index-abc123.js").write_text("console.log('nabta')", encoding="utf-8")
    (folder / "logo-mark.png").write_bytes(b"\x89PNG")
    (tmp_path / "secret.txt").write_text("not for the web", encoding="utf-8")
    return folder


@pytest.fixture
def served(settings, dist):
    with TestClient(create_app(settings.model_copy(update={"frontend_dist": dist}))) as client:
        yield client


@pytest.mark.parametrize("path", ["/", "/dashboard", "/plants/3?tab=tasks", "/pests/aphids", "/sign-in"])
def test_app_pages_get_the_single_page_app(served, path):
    response = served.get(path)

    assert response.status_code == 200
    assert response.text == INDEX
    assert response.headers["cache-control"] == "no-cache"


def test_built_files_are_served_and_cached(served):
    script = served.get("/assets/index-abc123.js")
    assert script.status_code == 200
    assert "immutable" in script.headers["cache-control"]
    assert served.get("/logo-mark.png").content == b"\x89PNG"


def test_the_api_still_answers_and_unknown_api_paths_are_json_404s(served):
    assert served.get("/api/health").status_code == 200
    assert_error(served.get("/api/no-such-thing"), 404, "not_found")


def test_files_outside_the_build_are_never_served(served):
    response = served.get("/..%2Fsecret.txt")

    assert "not for the web" not in response.text


def test_without_a_build_only_the_api_is_served(anon):
    assert_error(anon.get("/dashboard"), 404, "not_found")
