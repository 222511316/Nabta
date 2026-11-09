"""The assessed release runs without an OpenAI API key, so the AI features are off (supervisor review
OBS-06). Every AI endpoint must refuse clearly, and nothing may try to reach OpenAI.

The feature code stays (it is outside the charter, kept for later); these tests pin down that it is
inert without NABTA_OPENAI_API_KEY.
"""

import socket

import pytest

from app import main as app_main
from app.ai import writer as writer_module
from app.config import Settings
from tests.helpers import add_observation, add_plant, assert_error


@pytest.fixture(autouse=True)
def no_openai_and_no_network(monkeypatch):
    """Any attempt to build an OpenAI client or open a network connection fails the test."""

    def refuse(*args, **kwargs):
        raise AssertionError("Something tried to reach OpenAI or the network while AI is off.")

    monkeypatch.setattr(writer_module.OpenAiWriter, "__init__", refuse)
    import openai

    monkeypatch.setattr(openai, "OpenAI", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    real_connect = socket.socket.connect

    def connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6):
            refuse()
        return real_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", connect)


@pytest.fixture
def plant(grower):
    return add_plant(grower, "Lemon tree", plant_type="Lemon")


@pytest.fixture
def case(grower, plant):
    observation = add_observation(grower, plant["id"])
    return grower.post(f"/api/observations/{observation['id']}/review", json={"note": "Is this aphids?"}).json()


def test_the_default_settings_have_no_openai_key():
    assert Settings(_env_file=None).openai_api_key is None


def test_the_app_starts_with_ai_off(app):
    assert app.state.ai is None


@pytest.mark.parametrize("client_name", ["grower", "specialist"])
def test_ai_status_says_off(request, client_name):
    client = request.getfixturevalue(client_name)

    assert client.get("/api/ai").json() == {"enabled": False, "model": None}


def test_writing_a_plant_report_is_refused(grower, plant):
    assert_error(grower.post(f"/api/plants/{plant['id']}/report"), 503, "ai_unavailable")


def test_there_is_no_stored_plant_report_to_show(grower, plant):
    assert_error(grower.get(f"/api/plants/{plant['id']}/report"), 404, "not_found")


@pytest.mark.parametrize("body", [{}, {"outcome": "identified", "category_key": "aphids"}, {"outcome": "inconclusive"}])
def test_drafting_an_assessment_is_refused(specialist, case, body):
    assert_error(specialist.post(f"/api/specialist/cases/{case['id']}/draft", json=body), 503, "ai_unavailable")


@pytest.mark.parametrize("client_name", ["grower", "specialist"])
def test_asking_about_a_pest_is_refused(request, client_name):
    client = request.getfixturevalue(client_name)

    response = client.post("/api/pests/aphids/questions", json={"question": "Where do they hide?"})

    body = assert_error(response, 503, "ai_unavailable")
    assert body["message"] == "AI features aren't set up."


def test_asking_with_an_observation_is_refused_too(grower, plant):
    observation = add_observation(grower, plant["id"])

    response = grower.post(
        "/api/pests/aphids/questions", json={"question": "Is this bad?", "observation_id": observation["id"]}
    )

    assert_error(response, 503, "ai_unavailable")


def test_the_ai_refusal_keeps_the_rest_of_the_app_working(grower, plant, case):
    grower.post(f"/api/plants/{plant['id']}/report")

    assert grower.get(f"/api/plants/{plant['id']}").status_code == 200
    assert grower.get(f"/api/observations/{case['observation_id']}/review").json()["status"] == "waiting_for_specialist"


def test_create_app_without_a_key_never_builds_an_openai_client(settings):
    application = app_main.create_app(settings)  # OpenAiWriter.__init__ would fail the test
    try:
        assert application.state.ai is None
    finally:
        application.state.engine.dispose()
