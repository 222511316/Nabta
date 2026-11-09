"""Server-side sessions: the browser holds a random token, the database only its hash."""

from datetime import timedelta

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import utcnow
from app.models import User, UserSession
from app.services import security

SESSION_COOKIE = "nabta_session"


def start_session(db: Session, user: User, settings: Settings) -> str:
    token = security.new_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=security.hash_token(token),
            expires_at=utcnow() + timedelta(days=settings.session_days),
        )
    )
    return token


def find_session(db: Session, token: str | None) -> UserSession | None:
    """The live session for a cookie token. An expired one is deleted and ignored."""
    if not token:
        return None
    session = db.scalars(
        select(UserSession).where(UserSession.token_hash == security.hash_token(token))
    ).first()
    if session is None:
        return None
    if session.expires_at <= utcnow():
        db.delete(session)
        db.commit()
        return None
    return session


def end_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == security.hash_token(token)))


def end_all_sessions(db: Session, user_id: int, *, except_session_id: int | None = None) -> None:
    statement = delete(UserSession).where(UserSession.user_id == user_id)
    if except_session_id is not None:
        statement = statement.where(UserSession.id != except_session_id)
    db.execute(statement)


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=settings.cookie_secure
    )
