import os

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Base
from app.main import create_app
from app.models import Role
from app.services import security, users
from tests.helpers import PASSWORD, login, register


@pytest.fixture(autouse=True)
def _isolate_environment(monkeypatch):
    """Tests never read NABTA_* variables from the developer's shell."""
    for name in list(os.environ):
        if name.upper().startswith("NABTA_"):
            monkeypatch.delenv(name)


@pytest.fixture(autouse=True)
def _fast_password_hashing(monkeypatch):
    """Argon2id with minimal cost so the suite stays fast; the algorithm is unchanged."""
    monkeypatch.setattr(
        security, "password_hasher", PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)
    )


@pytest.fixture
def settings(request, tmp_path):
    marker = request.node.get_closest_marker("settings")
    overrides = marker.kwargs if marker else {}
    return Settings(
        _env_file=None,
        database_url=f"sqlite:///{(tmp_path / 'nabta.db').as_posix()}",
        storage_dir=tmp_path / "storage",
        model_dir=tmp_path / "no-model",
        frontend_dist=tmp_path / "no-frontend",
        **overrides,
    )


@pytest.fixture
def app(settings):
    application = create_app(settings)
    Base.metadata.create_all(application.state.engine)
    yield application
    application.state.engine.dispose()


@pytest.fixture
def db(app):
    session = app.state.session_factory()
    yield session
    session.close()


@pytest.fixture
def anon(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def make_client(app):
    """Creates extra TestClients (separate cookie jars = separate browsers)."""
    clients = []

    def _make(**kwargs):
        client = TestClient(app, **kwargs)
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def grower(make_client):
    """A signed-in grower: Sara."""
    client = make_client()
    register(client, email="sara@example.com", full_name="Sara Ahmed")
    return client


@pytest.fixture
def other_grower(make_client):
    """A second signed-in grower: Omar."""
    client = make_client()
    register(client, email="omar@example.com", full_name="Omar Saleh")
    return client


@pytest.fixture
def specialist(db, make_client):
    """A signed-in specialist, created the same way the CLI creates one."""
    users.create_user(
        db,
        email="khalid@example.com",
        full_name="Khalid Alharbi",
        password=PASSWORD,
        role=Role.SPECIALIST,
        approved=True,  # the CLI's accounts are approved from the start
    )
    db.commit()
    client = make_client()
    login(client, email="khalid@example.com")
    return client


@pytest.fixture
def pending_specialist(make_client):
    """A signed-in specialist who signed up on the website: Huda, waiting for the team's approval."""
    client = make_client()
    register(client, email="huda@example.com", full_name="Huda Alqahtani", role="specialist")
    return client


@pytest.fixture
def outbox(app):
    """Captures outgoing email instead of printing or sending it."""
    sent = []

    class CapturingSender:
        def send(self, message):
            sent.append(message)

    app.state.email_sender = CapturingSender()
    return sent

