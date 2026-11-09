from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


class Plant(Base):
    __tablename__ = "plants"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    plant_type: Mapped[str | None] = mapped_column(String(80))
    location: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    observations: Mapped[list["Observation"]] = relationship(
        back_populates="plant", cascade="all, delete-orphan", passive_deletes=True
    )


class Observation(Base):
    """A dated insect photo on a plant. Its owner is the plant's owner (single source of truth)."""

    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="CASCADE"), index=True)
    observed_on: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    photo_filename: Mapped[str] = mapped_column(String(64))
    thumb_filename: Mapped[str] = mapped_column(String(64))
    photo_width: Mapped[int] = mapped_column(Integer)
    photo_height: Mapped[int] = mapped_column(Integer)
    # Sent by the browser once per submission so a retried upload is not saved twice.
    client_request_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    plant: Mapped[Plant] = relationship(back_populates="observations")
