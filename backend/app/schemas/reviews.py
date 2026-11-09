from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import UtcTimestamp, optional_text, required_text
from app.schemas.observations import AnalysisOut, PestRef

CaseStatusName = Literal["waiting_for_specialist", "waiting_for_grower", "answered"]


class ReviewRequestIn(BaseModel):
    note: optional_text(1000) = None


class MessageIn(BaseModel):
    body: required_text(2000)


class FeedbackIn(BaseModel):
    outcome: Literal["identified", "inconclusive"]
    category_key: str | None = None
    other_pest: optional_text(80) = None
    message: required_text(2000)


class MessageOut(BaseModel):
    id: int
    kind: Literal["question", "reply"]
    body: str
    author_name: str
    created_at: UtcTimestamp


class FeedbackOut(BaseModel):
    outcome: Literal["identified", "inconclusive"]
    category: PestRef | None
    other_pest: str | None
    message: str
    specialist_name: str
    matches_suggestion: bool  # the specialist named the same pest the model suggested
    created_at: UtcTimestamp


class GrowerCaseOut(BaseModel):
    """What the grower sees on their observation."""

    id: int
    observation_id: int
    status: CaseStatusName
    note: str | None
    specialist_name: str | None
    messages: list[MessageOut]
    feedback: FeedbackOut | None
    created_at: UtcTimestamp
    updated_at: UtcTimestamp


class ReviewSummaryOut(BaseModel):
    id: int
    observation_id: int
    status: CaseStatusName
    plant_name: str
    observed_on: date
    thumb_url: str
    updated_at: UtcTimestamp


class SuggestionOut(BaseModel):
    outcome: Literal["identified", "unclear"]
    name: str | None  # the suggested pest, when identified
    confidence: float


class QueueItemOut(BaseModel):
    id: int
    status: CaseStatusName
    assigned_to_me: bool
    plant_name: str
    grower_name: str
    observed_on: date
    suggestion: SuggestionOut | None
    thumb_url: str
    created_at: UtcTimestamp
    updated_at: UtcTimestamp


class CasePlantOut(BaseModel):
    name: str
    plant_type: str | None
    location: str | None


class CaseObservationOut(BaseModel):
    id: int
    observed_on: date
    notes: str | None
    photo_url: str
    thumb_url: str
    photo_width: int
    photo_height: int


class SpecialistCaseOut(BaseModel):
    """What the specialist sees when they open a case (US14)."""

    id: int
    status: CaseStatusName
    assigned_to_me: bool
    note: str | None
    grower_name: str
    plant: CasePlantOut
    observation: CaseObservationOut
    analysis: AnalysisOut | None
    messages: list[MessageOut]
    feedback: FeedbackOut | None
    created_at: UtcTimestamp
    updated_at: UtcTimestamp


class NotificationOut(BaseModel):
    id: int
    kind: Literal["question_asked", "grower_replied", "feedback_sent"]
    case_id: int
    plant_name: str
    actor_name: str
    link: str
    read: bool
    created_at: UtcTimestamp


class InboxOut(BaseModel):
    unread: int
    items: list[NotificationOut]
