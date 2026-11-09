from datetime import date
from typing import Literal

from pydantic import BaseModel

ReviewStatus = Literal["awaiting_review", "reviewed"]


class PestSummaryOut(BaseModel):
    key: str
    name: str
    summary: str
    image_url: str  # the first reference photo
    review_status: ReviewStatus


class SourceOut(BaseModel):
    title: str
    publisher: str
    url: str


class ContentReviewOut(BaseModel):
    status: ReviewStatus
    reviewed_by: str | None
    reviewed_on: date | None


class ReferenceImageOut(BaseModel):
    url: str
    caption: str
    credit: str


class GuidanceStepOut(BaseModel):
    kind: Literal["check", "prevent", "remove", "natural_enemies"]
    task: str  # short: becomes the task title when the grower adds it
    text: str


class TranslationOut(BaseModel):
    language: str
    status: ReviewStatus  # a native speaker on the team checks each translation


class PestOut(BaseModel):
    key: str
    name: str
    summary: str
    look_for: list[str]
    size: str | None  # left out when the source gives none
    where: str
    damage: str
    look_alikes: str
    sources: list[SourceOut]
    review: ContentReviewOut
    images: list[ReferenceImageOut]
    guidance: list[GuidanceStepOut]  # US17: what the grower can do, from the same sources
    translation: TranslationOut | None  # set when this is a translated version
