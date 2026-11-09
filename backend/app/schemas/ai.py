from typing import Literal

from pydantic import BaseModel

from app.schemas.common import UtcTimestamp, optional_text, required_text
from app.schemas.observations import PestRef


class AiStatusOut(BaseModel):
    enabled: bool
    model: str | None


class ReportEventOut(BaseModel):
    date: str
    text: str


class ReportStepOut(BaseModel):
    text: str
    pest: PestRef | None  # the reviewed pest page the step comes from


class PlantReportOut(BaseModel):
    summary: str
    timeline: list[ReportEventOut]
    open_items: list[str]
    next_steps: list[ReportStepOut]
    model: str
    created_at: UtcTimestamp


class DraftIn(BaseModel):
    """The specialist's decision so far, if any, so the draft agrees with it."""

    outcome: Literal["identified", "inconclusive"] | None = None
    category_key: str | None = None
    other_pest: optional_text(80) = None


class DraftOut(BaseModel):
    message: str
    model: str


class QuestionIn(BaseModel):
    question: required_text(300)
    observation_id: int | None = None  # the grower's own observation, for context


class AnswerOut(BaseModel):
    answer: str
    covered_by_guide: bool
    suggest_specialist: bool
    model: str
