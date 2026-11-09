from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import UtcTimestamp


class PestRef(BaseModel):
    key: str
    name: str


class PredictionOut(PestRef):
    probability: float


class AnalysisOut(BaseModel):
    outcome: Literal["identified", "unclear"]
    unclear_reason: Literal["unfamiliar", "uncertain"] | None  # set only when unclear
    category: PestRef | None  # set only when identified
    confidence: float  # the top probability, identified or not
    predictions: list[PredictionOut]  # most likely first
    model_version: str
    created_at: UtcTimestamp


class ObservationOut(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    observed_on: date
    notes: str | None
    photo_url: str
    thumb_url: str
    photo_width: int
    photo_height: int
    created_at: UtcTimestamp
    analysis: AnalysisOut | None
    review_status: Literal["waiting_for_specialist", "waiting_for_grower", "answered"] | None
