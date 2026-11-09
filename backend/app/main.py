"""Application factory."""

from fastapi import FastAPI

from app.ai.writer import load_writer
from app.analysis.classifier import load_classifier
from app.config import Settings
from app.db import create_db_engine, create_session_factory
from app.errors import register_error_handlers
from app.pests import load_catalog
from app.routers import account, ai, auth, health, notifications, observations, pests, plants, reviews, specialist
from app.security_middleware import RejectCrossSiteWrites
from app.services.email import email_sender_for


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.photos_dir.mkdir(parents=True, exist_ok=True)

    # redirect_slashes=False: a redirect would point the browser past the Vite proxy.
    application = FastAPI(title="Nabta API", redirect_slashes=False)
    application.state.settings = settings
    application.state.engine = create_db_engine(settings.database_url)
    application.state.session_factory = create_session_factory(application.state.engine)
    application.state.email_sender = email_sender_for(settings)
    application.state.classifier = load_classifier(settings.model_dir)
    application.state.pests = load_catalog()
    application.state.ai = load_writer(settings)

    register_error_handlers(application)
    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(account.router)
    application.include_router(plants.router)
    application.include_router(observations.router)
    application.include_router(pests.router)
    application.include_router(reviews.router)
    application.include_router(specialist.router)
    application.include_router(notifications.router)
    application.include_router(ai.router)
    application.add_middleware(RejectCrossSiteWrites)
    return application


app = create_app()
