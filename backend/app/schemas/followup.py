from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import AnyPassword, UtcTimestamp, optional_text, required_text
from app.schemas.observations import PestRef


class TaskIn(BaseModel):
    title: required_text(120)
    notes: optional_text(1000) = None
    due_on: date | None = None
    observation_id: int | None = None  # the observation it follows up, on the same plant
    pest_key: str | None = None  # the pest guide it came from


class TaskPatch(BaseModel):
    """Only the fields sent are changed; due_on and notes can be cleared with null."""

    title: required_text(120) | None = None
    notes: optional_text(1000) = None
    due_on: date | None = None
    done: bool | None = None


class TaskOut(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    observation_id: int | None
    pest: PestRef | None
    title: str
    notes: str | None
    due_on: date | None
    done: bool
    done_at: UtcTimestamp | None
    created_at: UtcTimestamp


class NoteIn(BaseModel):
    noted_on: date
    body: required_text(2000)


class NotePatch(BaseModel):
    noted_on: date | None = None
    body: required_text(2000) | None = None


class NoteOut(BaseModel):
    id: int
    plant_id: int
    noted_on: date
    body: str
    created_at: UtcTimestamp
    updated_at: UtcTimestamp


class ConsentIn(BaseModel):
    research_consent: bool


class AccountDeleteIn(BaseModel):
    password: AnyPassword


class SummaryOut(BaseModel):
    """What needs the grower's attention, for the dashboard (US21)."""

    tasks_overdue: int
    tasks_due_today: int
    reviews_waiting_for_you: int
    unclear_not_reviewed: int
    open_tasks: int


SearchType = Literal["all", "plants", "observations", "tasks", "notes"]
ResultFilter = Literal["identified", "unclear", "review"]
TaskStatus = Literal["open", "done"]


class PlantHit(BaseModel):
    id: int
    name: str
    plant_type: str | None
    location: str | None


class ResultOut(BaseModel):
    outcome: Literal["identified", "unclear"]
    pest: PestRef | None


class ObservationHit(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    observed_on: date
    notes: str | None
    thumb_url: str
    result: ResultOut | None
    review_status: str | None


class NoteHit(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    noted_on: date
    body: str


class SearchOut(BaseModel):
    plants: list[PlantHit]
    observations: list[ObservationHit]
    tasks: list[TaskOut]
    notes: list[NoteHit]
