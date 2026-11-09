from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


class Analysis(Base):
    """The model's result for one observation (US09). It keeps the model version (NFR13)."""

    __tablename__ = "analyses"
    __table_args__ = (
        CheckConstraint("outcome IN ('identified', 'unclear')", name="outcome_valid"),
        CheckConstraint("unclear_reason IN ('unfamiliar', 'uncertain')", name="unclear_reason_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    observation_id: Mapped[int] = mapped_column(
        ForeignKey("observations.id", ondelete="CASCADE"), unique=True
    )
    outcome: Mapped[str] = mapped_column(String(20))
    category_key: Mapped[str | None] = mapped_column(String(40))  # set only when identified
    confidence: Mapped[float] = mapped_column(Float)  # the top probability
    # Similarity to the nearest training photo, when the model reports it.
    familiarity: Mapped[float | None] = mapped_column(Float)
    # Why a result is unclear: the photo looks unlike the training photos ("unfamiliar"), or the
    # top category isn't likely enough ("uncertain"). None when identified.
    unclear_reason: Mapped[str | None] = mapped_column(String(20))
    # The top predictions as [{key, name, probability}], names stored so old results stay readable.
    predictions: Mapped[list] = mapped_column(JSON)
    model_version: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    observation: Mapped["Observation"] = relationship(back_populates="analysis")  # noqa: F821
