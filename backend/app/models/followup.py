from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


class Task(Base):
    """A follow-up action on a plant (US18). It can come from an observation or a guidance step,
    and puts a reminder in the grower's notifications once its due date arrives."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="CASCADE"), index=True)
    observation_id: Mapped[int | None] = mapped_column(ForeignKey("observations.id", ondelete="SET NULL"))
    pest_key: Mapped[str | None] = mapped_column(String(40))  # the guidance it came from
    title: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    due_on: Mapped[date | None] = mapped_column(Date)
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    reminded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # once per due date
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    plant: Mapped["Plant"] = relationship(back_populates="tasks")  # noqa: F821
    observation: Mapped["Observation | None"] = relationship()  # noqa: F821


class Note(Base):
    """A dated personal note on a plant (US19)."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="CASCADE"), index=True)
    noted_on: Mapped[date] = mapped_column(Date)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    plant: Mapped["Plant"] = relationship(back_populates="notes_log")  # noqa: F821
