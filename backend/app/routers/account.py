"""US04: a signed-in user (either role) views and updates their own details.
US22: a grower controls research consent and can delete their account with all its data."""

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.db import utcnow
from app.deps import AppSettings, CurrentSession, CurrentUser, DbSession, Grower
from app.errors import ApiError
from app.models import Observation, Plant, User
from app.schemas.followup import AccountDeleteIn, ConsentIn
from app.schemas.users import AccountUpdateIn, PasswordChangeIn, UserOut
from app.services import photos, security, sessions, users

router = APIRouter(prefix="/api/account", tags=["account"])


@router.patch("", response_model=UserOut)
def update_account(payload: AccountUpdateIn, user: CurrentUser, db: DbSession) -> User:
    if payload.email is not None and payload.email != user.email:
        if users.find_by_email(db, payload.email):
            raise users.email_taken()
        user.email = payload.email
    if payload.full_name is not None:
        user.full_name = payload.full_name
    db.commit()
    return user


@router.post("/password", status_code=204)
def change_password(payload: PasswordChangeIn, session: CurrentSession, db: DbSession) -> None:
    user = session.user
    if not security.verify_password(user.password_hash, payload.current_password):
        raise ApiError(400, "wrong_password", "Your current password is incorrect.")
    users.set_password(user, payload.new_password)
    # Other devices must sign in again with the new password; this one stays signed in.
    sessions.end_all_sessions(db, user.id, except_session_id=session.id)
    db.commit()


@router.patch("/consent", response_model=UserOut)
def set_research_consent(payload: ConsentIn, grower: Grower, db: DbSession) -> User:
    if payload.research_consent != grower.research_consent:
        grower.research_consent = payload.research_consent
        grower.research_consent_at = utcnow()
        db.commit()
    return grower


@router.delete("", status_code=204)
def delete_account(
    payload: AccountDeleteIn, grower: Grower, db: DbSession, settings: AppSettings, response: Response
) -> None:
    """Everything goes: plants, photos, results, reviews, tasks, notes, sessions. Specialist accounts are
    removed by the team instead, so their review history stays with the growers they helped."""
    if not security.verify_password(grower.password_hash, payload.password):
        raise ApiError(400, "wrong_password", "Your password is incorrect.")
    files = [
        name
        for photo, thumb in db.execute(
            select(Observation.photo_filename, Observation.thumb_filename)
            .join(Plant)
            .where(Plant.owner_id == grower.id)
        )
        for name in (photo, thumb)
    ]
    db.delete(grower)  # the database removes the rest (ON DELETE CASCADE)
    db.commit()
    photos.delete_files(settings.photos_dir, files)
    sessions.clear_session_cookie(response, settings)
