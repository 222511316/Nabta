from datetime import datetime

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utcnow


class PlantReport(Base):
    """An AI-written report on a plant's history. Kept so it can be reopened without asking the
    model again; it records which model wrote it and when."""

    __tablename__ = "plant_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="CASCADE"), index=True)
    # {summary, timeline: [{date, text}], open_items: [...], next_steps: [{text, pest_key}]}
    content: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
