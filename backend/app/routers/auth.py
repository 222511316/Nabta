"""US01–US03: registration, sign-in/out and password reset."""

from fastapi import APIRouter, BackgroundTasks, Request, Response

from app.deps import AppSettings, CurrentUser, DbSession
from app.errors import ApiError
from app.models import Role, User
from app.schemas.users import LoginIn, RegisterIn, ResetConfirmIn, ResetRequestIn, UserOut
from app.services import password_reset, sessions, users
from app.services.email import password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _sign_in(request: Request, response: Response, db: DbSession, settings: AppSettings, user: User) -> None:
    # Whatever this browser was signed in as before is signed out.
    sessions.end_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    token = sessions.start_session(db, user, settings)
    db.commit()
    sessions.set_session_cookie(response, token, settings)


@router.post("/register", status_code=201, response_model=UserOut)
def register(
    payload: RegisterIn, request: Request, response: Response, db: DbSession, settings: AppSettings
) -> User:
    user = users.create_user(
        db,
        email=payload.email,
        full_name=payload.full_name,
        password=payload.password,
        # Both roles sign up themselves; each role is a separate account (team decision, 2026-09-24).
        role=Role(payload.role),
    )
    _sign_in(request, response, db, settings, user)
    return user


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginIn, request: Request, response: Response, db: DbSession, settings: AppSettings
) -> User:
    user = users.authenticate(db, payload.email, payload.password)
    if user is None:
        raise ApiError(401, "invalid_credentials", "The email or password is incorrect.")
    # Checked only after the password, so the account's role is revealed to its owner alone.
    if payload.role is not None and payload.role != user.role:
        raise ApiError(403, "role_mismatch", f"This account is registered as a {user.role}.")
    _sign_in(request, response, db, settings, user)
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbSession, settings: AppSettings) -> None:
    sessions.end_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    db.commit()
    sessions.clear_session_cookie(response, settings)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/password-reset/request", status_code=202)
def request_password_reset(
    payload: ResetRequestIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DbSession,
    settings: AppSettings,
) -> dict[str, bool]:
    # The same answer whether or not the account exists, and the email goes out
    # after the response, so neither content nor timing reveals who has an account.
    user = users.find_by_email(db, payload.email)
    if user is not None:
        token = password_reset.issue_token(db, user, settings)
        db.commit()
        message = password_reset_email(
            user.email, password_reset.reset_link(token, settings), settings.reset_token_minutes
        )
        background_tasks.add_task(request.app.state.email_sender.send, message)
    return {"ok": True}


@router.post("/password-reset/confirm", status_code=204)
def confirm_password_reset(payload: ResetConfirmIn, db: DbSession) -> None:
    password_reset.redeem_token(db, payload.token, payload.new_password)
    db.commit()
