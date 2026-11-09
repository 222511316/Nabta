from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


class Role(StrEnum):
    GROWER = "grower"
    SPECIALIST = "specialist"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('grower', 'specialist')", name="role_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)  # stored trimmed + lowercase
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    # US22: research use of the grower's photos, off unless they switch it on.
    research_consent: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    research_consent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # when it last changed
    # Specialists only (FR03, FR12, NFR05, NFR06): when the Nabta team approved the account. A specialist
    # without it is pending and sees no review cases. Growers ignore it.
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    @property
    def specialist_status(self) -> str | None:
        """"approved" or "pending" for a specialist; None for a grower."""
        if self.role != Role.SPECIALIST:
            return None
        return "approved" if self.approved_at is not None else "pending"


class UserSession(Base):
    """A signed-in browser. Only a SHA-256 hash of the cookie token is stored."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship()


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship()
