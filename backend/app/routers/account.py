"""US04: a signed-in user (either role) views and updates their own details."""

from fastapi import APIRouter

from app.deps import CurrentSession, CurrentUser, DbSession
from app.errors import ApiError
from app.models import User
from app.schemas.users import AccountUpdateIn, PasswordChangeIn, UserOut
from app.services import security, sessions, users

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
