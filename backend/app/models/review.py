from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


class CaseStatus:
    WAITING_FOR_SPECIALIST = "waiting_for_specialist"
    WAITING_FOR_GROWER = "waiting_for_grower"
    ANSWERED = "answered"


class ReviewCase(Base):
    """A grower's request for a specialist to check one observation (US12)."""

    __tablename__ = "review_cases"
    __table_args__ = (
        CheckConstraint(
            "status IN ('waiting_for_specialist', 'waiting_for_grower', 'answered')", name="status_valid"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id", ondelete="CASCADE"), unique=True)
    status: Mapped[str] = mapped_column(String(30), default=CaseStatus.WAITING_FOR_SPECIALIST)
    note: Mapped[str | None] = mapped_column(Text)  # the grower's reason for asking
    # The specialist who took the case; only they can see it from then on (NFR06).
    specialist_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)  # last activity

    observation: Mapped["Observation"] = relationship(back_populates="review")  # noqa: F821
    specialist: Mapped["User | None"] = relationship()  # noqa: F821
    messages: Mapped[list["CaseMessage"]] = relationship(
        back_populates="case", order_by="CaseMessage.id", cascade="all, delete-orphan", passive_deletes=True
    )
    feedback: Mapped["CaseFeedback | None"] = relationship(
        back_populates="case", cascade="all, delete-orphan", passive_deletes=True
    )


class CaseMessage(Base):
    """A dated question from the specialist or reply from the grower (US15)."""

    __tablename__ = "case_messages"
    __table_args__ = (CheckConstraint("kind IN ('question', 'reply')", name="kind_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("review_cases.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    case: Mapped[ReviewCase] = relationship(back_populates="messages")
    author: Mapped["User"] = relationship()  # noqa: F821


class CaseFeedback(Base):
    """The specialist's assessment, kept apart from the model's result (US16)."""

    __tablename__ = "case_feedback"
    __table_args__ = (CheckConstraint("outcome IN ('identified', 'inconclusive')", name="outcome_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("review_cases.id", ondelete="CASCADE"), unique=True)
    specialist_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    outcome: Mapped[str] = mapped_column(String(20))
    category_key: Mapped[str | None] = mapped_column(String(40))  # one of Nabta's pests…
    other_pest: Mapped[str | None] = mapped_column(String(80))  # …or a pest outside the list
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    case: Mapped[ReviewCase] = relationship(back_populates="feedback")
    specialist: Mapped["User"] = relationship()  # noqa: F821


class Notification(Base):
    """An in-app notice about a review case (US13, FR15) or a task that has come due (US18)."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('question_asked', 'grower_replied', 'feedback_sent', 'task_due')", name="kind_valid"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    case_id: Mapped[int | None] = mapped_column(ForeignKey("review_cases.id", ondelete="CASCADE"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    case: Mapped[ReviewCase | None] = relationship()
    task: Mapped["Task | None"] = relationship()  # noqa: F821
