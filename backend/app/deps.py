"""Request dependencies: settings, database session, the signed-in user and role checks."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_db
from app.errors import ApiError
from app.models import Role, User, UserSession
from app.pests import Catalog
from app.services import sessions


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_catalog(request: Request) -> Catalog:
    return request.app.state.pests


def get_ai_writer(request: Request):
    """The language model for the AI features, or None when no API key is set."""
    return request.app.state.ai


DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
PestCatalog = Annotated[Catalog, Depends(get_catalog)]
AiWriter = Annotated[object | None, Depends(get_ai_writer)]


def get_current_session(request: Request, db: DbSession) -> UserSession:
    session = sessions.find_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    if session is None:
        raise ApiError(401, "not_authenticated", "Please sign in to continue.")
    return session


CurrentSession = Annotated[UserSession, Depends(get_current_session)]


def get_current_user(session: CurrentSession) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(role: Role):
    def check_role(user: CurrentUser) -> User:
        if user.role != role:
            raise ApiError(403, "forbidden", "You do not have access to this.")
        return user

    return check_role


Grower = Annotated[User, Depends(require_role(Role.GROWER))]
Specialist = Annotated[User, Depends(require_role(Role.SPECIALIST))]
