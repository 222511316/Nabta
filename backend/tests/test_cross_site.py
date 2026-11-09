"""Write requests sent from another website are refused (spec §3.3)."""

import pytest

from tests.helpers import assert_error, register

LOGIN = {"email": "sara@example.com", "password": "correct-horse-42"}


@pytest.mark.parametrize("method", ["POST", "PATCH", "PUT", "DELETE"])
def test_cross_site_writes_are_refused(anon, method):
    response = anon.request(method, "/api/auth/login", json=LOGIN, headers={"Sec-Fetch-Site": "cross-site"})

    assert_error(response, 403, "cross_site_request")


def test_a_cross_site_write_changes_nothing(grower):
    response = grower.patch(
        "/api/account", json={"full_name": "Hacked"}, headers={"Sec-Fetch-Site": "cross-site"}
    )

    assert_error(response, 403, "cross_site_request")
    assert grower.get("/api/auth/me").json()["full_name"] == "Sara Ahmed"


@pytest.mark.parametrize("site", ["same-origin", "same-site", "none"])
def test_writes_from_the_app_itself_are_allowed(anon, site):
    response = anon.post(
        "/api/auth/register",
        json={"full_name": "Sara Ahmed", **LOGIN},
        headers={"Sec-Fetch-Site": site},
    )

    assert response.status_code == 201


def test_requests_without_the_header_are_allowed(anon):
    register(anon)  # curl, scripts and the test client send no Sec-Fetch-Site


def test_cross_site_reads_are_not_blocked(anon):
    response = anon.get("/api/health", headers={"Sec-Fetch-Site": "cross-site"})

    assert response.status_code == 200
