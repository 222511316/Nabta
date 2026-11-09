"""Single-use, time-limited password reset tokens (spec §3.3)."""

from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import utcnow
from app.errors import ApiError
from app.models import PasswordResetToken, User
from app.services import security, sessions, users


def issue_token(db: Session, user: User, settings: Settings) -> str:
    token = security.new_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=security.hash_token(token),
            expires_at=utcnow() + timedelta(minutes=settings.reset_token_minutes),
        )
    )
    return token


def reset_link(token: str, settings: Settings) -> str:
    return f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"


def redeem_token(db: Session, token: str, new_password: str) -> None:
    """Sets the new password, retires every outstanding link and signs the user out everywhere."""
    record = db.scalars(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == security.hash_token(token))
    ).first()
    now = utcnow()
    if record is None or record.used_at is not None or record.expires_at <= now:
        raise ApiError(400, "invalid_reset_token", "This reset link is invalid or has expired.")

    users.set_password(record.user, new_password)
    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == record.user_id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    sessions.end_all_sessions(db, record.user_id)
