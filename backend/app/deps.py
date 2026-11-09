"""Request dependencies: settings, database session, the signed-in user, role checks and specialist approval."""

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


def get_language(request: Request) -> str:
    """The interface language the browser asks for (US23): Arabic or English."""
    first = request.headers.get("accept-language", "").split(",")[0].strip().lower()
    return "ar" if first.startswith("ar") else "en"


def get_ai_writer(request: Request):
    """The language model for the AI features, or None when no API key is set."""
    return request.app.state.ai


DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
PestCatalog = Annotated[Catalog, Depends(get_catalog)]
AiWriter = Annotated[object | None, Depends(get_ai_writer)]
Language = Annotated[str, Depends(get_language)]


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
# Any specialist account, approved or not. Only for the account itself; never for cases or grower data.
AnySpecialist = Annotated[User, Depends(require_role(Role.SPECIALIST))]


def specialist_pending() -> ApiError:
    return ApiError(
        403,
        "specialist_pending",
        "Your specialist account is waiting for approval by the Nabta team. "
        "You can see review cases once it is approved.",
    )


def require_approved_specialist(specialist: AnySpecialist) -> User:
    """FR03, FR12, NFR05, NFR06: only specialists the Nabta team has approved open review cases.
    A pending specialist can sign in and manage their account, nothing more."""
    if specialist.approved_at is None:
        raise specialist_pending()
    return specialist


# Every route that shows cases or grower data to a specialist uses this one.
ApprovedSpecialist = Annotated[User, Depends(require_approved_specialist)]
