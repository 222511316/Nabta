"""US08, NFR05, NFR06, R06: every protected endpoint checked against every kind of caller.

Expected answers:
  anonymous          → 401 everywhere
  specialist         → 403 on grower endpoints
  grower             → 403 on specialist endpoints
  another grower     → 404 on the owner's plant and observation records (existence is not revealed)
  pending specialist → 403 specialist_pending on every specialist endpoint, 403 forbidden on grower
                       endpoints; their own account and the pest reference still work (FR03, FR12,
                       NFR05, NFR06; supervisor review OBS-14)
"""

import pytest

from tests.helpers import PASSWORD, add_observation, add_plant, assert_error
from tests.images import jpeg

PLANT_BODY = {"name": "Fig"}

# (method, path template, request kwargs)
ACCOUNT_ENDPOINTS = [
    ("GET", "/api/auth/me", {}),
    ("PATCH", "/api/account", {"json": {"full_name": "Someone"}}),
    ("POST", "/api/account/password", {"json": {"current_password": PASSWORD, "new_password": "new-password-1"}}),
    ("GET", "/api/notifications", {}),
    ("POST", "/api/notifications/read-all", {}),
]
GROWER_COLLECTION_ENDPOINTS = [
    ("GET", "/api/plants", {}),
    ("POST", "/api/plants", {"json": PLANT_BODY}),
    ("GET", "/api/reviews", {}),
    ("GET", "/api/tasks", {}),
    ("GET", "/api/search?q=fig", {}),
    ("GET", "/api/summary", {}),
    ("PATCH", "/api/account/consent", {"json": {"research_consent": True}}),
    ("DELETE", "/api/account", {"json": {"password": PASSWORD}}),
]
GROWER_RECORD_ENDPOINTS = [
    ("GET", "/api/plants/{plant}", {}),
    ("PATCH", "/api/plants/{plant}", {"json": {"name": "Renamed"}}),
    ("DELETE", "/api/plants/{plant}", {}),
    ("GET", "/api/plants/{plant}/observations", {}),
    (
        "POST",
        "/api/plants/{plant}/observations",
        {"data": {"observed_on": "2026-09-20"}, "files": {"photo": ("bug.jpg", jpeg(), "image/jpeg")}},
    ),
    ("GET", "/api/observations/{observation}", {}),
    ("GET", "/api/observations/{observation}/photo", {}),
    ("GET", "/api/observations/{observation}/photo?variant=thumb", {}),
    ("POST", "/api/observations/{observation}/analysis", {}),
    ("GET", "/api/observations/{observation}/review", {}),
    ("POST", "/api/observations/{observation}/review", {"json": {"note": "Please check"}}),
    ("POST", "/api/reviews/{case}/replies", {"json": {"body": "More detail"}}),
    ("GET", "/api/plants/{plant}/report", {}),
    ("POST", "/api/plants/{plant}/report", {}),
    ("DELETE", "/api/observations/{observation}", {}),
    ("GET", "/api/tasks?plant_id={plant}", {}),
    ("POST", "/api/plants/{plant}/tasks", {"json": {"title": "Check the leaves"}}),
    ("PATCH", "/api/tasks/{task}", {"json": {"done": True}}),
    ("DELETE", "/api/tasks/{task}", {}),
    ("GET", "/api/plants/{plant}/notes", {}),
    ("POST", "/api/plants/{plant}/notes", {"json": {"noted_on": "2026-09-20", "body": "Rinsed the leaves."}}),
    ("PATCH", "/api/notes/{note}", {"json": {"body": "Changed"}}),
    ("DELETE", "/api/notes/{note}", {}),
]
SPECIALIST_ENDPOINTS = [
    ("GET", "/api/specialist/cases", {}),
    ("GET", "/api/specialist/cases/{case}", {}),
    ("GET", "/api/specialist/cases/{case}/photo", {}),
    ("POST", "/api/specialist/cases/{case}/claim", {}),
    ("POST", "/api/specialist/cases/{case}/questions", {"json": {"body": "A question"}}),
    (
        "POST",
        "/api/specialist/cases/{case}/feedback",
        {"json": {"outcome": "inconclusive", "message": "Can't tell from this photo."}},
    ),
    ("POST", "/api/specialist/cases/{case}/draft", {"json": {}}),
]
# Any signed-in user, when AI is set up (without it they answer 503, so only sign-in is checked here).
AI_ENDPOINTS = [
    ("POST", "/api/pests/aphids/questions", {"json": {"question": "Where do they hide?"}}),
]

REFERENCE_ENDPOINTS = [
    ("GET", "/api/ai", {}),
    ("GET", "/api/pests", {}),
    ("GET", "/api/pests/aphids", {}),
    ("GET", "/api/pests/aphids/images/aphids-1.jpg", {}),
]

ALL_PROTECTED = (
    ACCOUNT_ENDPOINTS
    + REFERENCE_ENDPOINTS
    + AI_ENDPOINTS
    + GROWER_COLLECTION_ENDPOINTS
    + GROWER_RECORD_ENDPOINTS
    + SPECIALIST_ENDPOINTS
)


def endpoint_id(endpoint):
    return f"{endpoint[0]} {endpoint[1]}"


@pytest.fixture
def records(grower):
    """Sara's plant, observation, review, task and note: the targets of the record checks."""
    plant = add_plant(grower, "Lemon tree")
    observation = add_observation(grower, plant["id"])
    case = grower.post(f"/api/observations/{observation['id']}/review", json={"note": "Is this aphids?"}).json()
    task = grower.post(f"/api/plants/{plant['id']}/tasks", json={"title": "Check the leaves"}).json()
    note = grower.post(f"/api/plants/{plant['id']}/notes", json={"noted_on": "2026-09-20", "body": "Rinsed."}).json()
    return {
        "plant": plant["id"],
        "observation": observation["id"],
        "case": case["id"],
        "task": task["id"],
        "note": note["id"],
    }


def call(client, endpoint, records):
    method, template, kwargs = endpoint
    return client.request(method, template.format(**records), **kwargs)


@pytest.mark.parametrize("endpoint", ALL_PROTECTED, ids=endpoint_id)
def test_anonymous_callers_must_sign_in(anon, records, endpoint):
    assert_error(call(anon, endpoint, records), 401, "not_authenticated")


@pytest.mark.parametrize("endpoint", GROWER_COLLECTION_ENDPOINTS + GROWER_RECORD_ENDPOINTS, ids=endpoint_id)
def test_specialists_are_denied_grower_endpoints(specialist, records, endpoint):
    assert_error(call(specialist, endpoint, records), 403, "forbidden")


@pytest.mark.parametrize("endpoint", SPECIALIST_ENDPOINTS, ids=endpoint_id)
def test_growers_are_denied_specialist_endpoints(grower, records, endpoint):
    assert_error(call(grower, endpoint, records), 403, "forbidden")


@pytest.mark.parametrize("endpoint", GROWER_RECORD_ENDPOINTS, ids=endpoint_id)
def test_another_grower_cannot_see_or_change_the_owner_s_records(other_grower, records, endpoint):
    assert_error(call(other_grower, endpoint, records), 404, "not_found")


def test_the_owner_s_records_are_untouched_by_those_attempts(grower, other_grower, records):
    for endpoint in GROWER_RECORD_ENDPOINTS:
        call(other_grower, endpoint, records)

    plant = grower.get(f"/api/plants/{records['plant']}").json()
    assert plant["name"] == "Lemon tree"
    assert plant["observation_count"] == 1


def test_specialists_reach_their_workspace(specialist):
    response = specialist.get("/api/specialist/cases")

    assert response.status_code == 200
    assert response.json() == []  # no grower has asked for a review yet


@pytest.mark.parametrize("endpoint", ACCOUNT_ENDPOINTS + REFERENCE_ENDPOINTS, ids=endpoint_id)
def test_both_roles_can_reach_their_account_and_the_pest_reference(grower, specialist, records, endpoint):
    for client in (grower, specialist):
        assert call(client, endpoint, records).status_code in (200, 204)


# Specialists waiting for the team's approval (supervisor review OBS-14) ----------------------------


@pytest.mark.parametrize("endpoint", SPECIALIST_ENDPOINTS, ids=endpoint_id)
def test_pending_specialists_are_denied_every_specialist_endpoint(pending_specialist, records, endpoint):
    assert_error(call(pending_specialist, endpoint, records), 403, "specialist_pending")


@pytest.mark.parametrize("endpoint", SPECIALIST_ENDPOINTS, ids=endpoint_id)
def test_pending_specialists_are_denied_a_case_another_specialist_has_taken(
    specialist, pending_specialist, records, endpoint
):
    specialist.post(f"/api/specialist/cases/{records['case']}/claim")

    assert_error(call(pending_specialist, endpoint, records), 403, "specialist_pending")


@pytest.mark.parametrize("endpoint", GROWER_COLLECTION_ENDPOINTS + GROWER_RECORD_ENDPOINTS, ids=endpoint_id)
def test_pending_specialists_are_denied_grower_endpoints(pending_specialist, records, endpoint):
    assert_error(call(pending_specialist, endpoint, records), 403, "forbidden")


@pytest.mark.parametrize("endpoint", ACCOUNT_ENDPOINTS + REFERENCE_ENDPOINTS, ids=endpoint_id)
def test_pending_specialists_can_reach_their_account_and_the_pest_reference(pending_specialist, records, endpoint):
    assert call(pending_specialist, endpoint, records).status_code in (200, 204)


def test_pending_specialists_leave_the_case_untouched(grower, pending_specialist, records):
    for endpoint in SPECIALIST_ENDPOINTS:
        call(pending_specialist, endpoint, records)

    review = grower.get(f"/api/observations/{records['observation']}/review").json()
    assert review["status"] == "waiting_for_specialist"
    assert review["specialist_name"] is None
    assert review["messages"] == []
    assert review["feedback"] is None


def test_every_specialist_route_requires_approval(app, pending_specialist, records):
    """Every /api/specialist operation the app publishes, including any added later, refuses a
    pending specialist, so the approval check can't be forgotten on one route."""
    operations = [
        (method.upper(), path)
        for path, item in app.openapi()["paths"].items()
        if path.startswith("/api/specialist")
        for method in item
    ]
    assert len(operations) >= len(SPECIALIST_ENDPOINTS)
    for method, path in operations:
        response = pending_specialist.request(method, path.replace("{case_id}", str(records["case"])), json={})
        assert_error(response, 403, "specialist_pending")
