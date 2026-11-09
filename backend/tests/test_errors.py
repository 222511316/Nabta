"""Every non-2xx response uses the {"code", "message", "fields"?} envelope."""

import logging

import pytest
from fastapi.testclient import TestClient

from tests.helpers import assert_error


@pytest.mark.parametrize(
    "path",
    [
        "/api/does-not-exist",
        "/api/health/",  # a trailing slash is not redirected
        "/somewhere-else",
    ],
)
def test_unknown_path_returns_not_found(anon, path):
    response = anon.get(path, follow_redirects=False)

    assert_error(response, 404, "not_found")


def test_wrong_method_returns_method_not_allowed(anon):
    response = anon.delete("/api/health")

    assert_error(response, 405, "method_not_allowed")
    assert "GET" in response.headers["allow"]


def test_unexpected_exception_returns_server_error_and_is_logged(app, caplog):
    def explode():
        raise RuntimeError("database fell over")

    app.add_api_route("/api/explode", explode)
    client = TestClient(app, raise_server_exceptions=False)

    with caplog.at_level(logging.ERROR):
        response = client.get("/api/explode")

    body = assert_error(response, 500, "server_error")
    assert "database fell over" not in body["message"]
    logged = [r for r in caplog.records if r.levelno >= logging.ERROR and r.exc_info]
    assert logged, "the unexpected exception should be logged with its traceback"
    assert "/api/explode" in logged[0].getMessage()
