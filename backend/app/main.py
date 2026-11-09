"""Application factory."""

from fastapi import FastAPI

from app.config import Settings
from app.db import create_db_engine, create_session_factory
from app.errors import register_error_handlers
from app.routers import account, auth, health, observations, plants, specialist
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

    register_error_handlers(application)
    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(account.router)
    application.include_router(plants.router)
    application.include_router(observations.router)
    application.include_router(specialist.router)
    application.add_middleware(RejectCrossSiteWrites)
    return application


app = create_app()
