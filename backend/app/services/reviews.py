"""Specialist review cases (US12–US16): requests, the queue, questions, replies and assessments."""

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import utcnow
from app.errors import ApiError, validation_error
from app.models import CaseFeedback, CaseMessage, CaseStatus, Observation, Plant, ReviewCase, User
from app.pests import Catalog
from app.schemas.observations import PestRef
from app.schemas.reviews import (
    CaseObservationOut,
    CasePlantOut,
    FeedbackIn,
    FeedbackOut,
    GrowerCaseOut,
    MessageOut,
    QueueItemOut,
    ReviewSummaryOut,
    SpecialistCaseOut,
    SuggestionOut,
)
from app.services import analysis as analysis_service
from app.services import notifications
from app.services.plants import not_found, thumb_url


def _closed() -> ApiError:
    return ApiError(409, "case_closed", "This review has been answered and is closed.")


def _touch(case: ReviewCase) -> None:
    case.updated_at = utcnow()


def _grower(case: ReviewCase) -> User:
    return case.observation.plant.owner


# Growers ---------------------------------------------------------------------------------


def request_review(db: Session, observation: Observation, note: str | None) -> ReviewCase:
    if observation.review is not None:
        raise ApiError(409, "review_exists", "A specialist review has already been requested for this observation.")
    case = ReviewCase(observation_id=observation.id, note=note, status=CaseStatus.WAITING_FOR_SPECIALIST)
    db.add(case)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "review_exists", "A specialist review has already been requested for this observation.") from None
    db.refresh(observation)
    return case


def grower_case(db: Session, grower: User, case_id: int) -> ReviewCase:
    case = db.get(ReviewCase, case_id)
    if case is None or _grower(case).id != grower.id:
        raise not_found()
    return case


def grower_cases(db: Session, grower: User) -> list[ReviewCase]:
    return list(
        db.scalars(
            select(ReviewCase)
            .join(Observation)
            .join(Plant)
            .where(Plant.owner_id == grower.id)
            .order_by(ReviewCase.updated_at.desc(), ReviewCase.id.desc())
        )
    )


def reply(db: Session, grower: User, case: ReviewCase, body: str) -> ReviewCase:
    if case.status == CaseStatus.ANSWERED:
        raise _closed()
    db.add(CaseMessage(case_id=case.id, author_id=grower.id, kind="reply", body=body))
    case.status = CaseStatus.WAITING_FOR_SPECIALIST
    _touch(case)
    if case.specialist_id is not None:
        notifications.notify(db, case.specialist_id, "grower_replied", case)
    db.commit()
    db.refresh(case)
    return case


# Specialists --------------------------------------------------------------------------------


def queue(db: Session, specialist: User) -> list[ReviewCase]:
    """Waiting cases nobody has taken, plus every case this specialist has taken."""
    return list(
        db.scalars(
            select(ReviewCase)
            .where(
                or_(
                    ReviewCase.specialist_id == specialist.id,
                    (ReviewCase.specialist_id.is_(None)) & (ReviewCase.status == CaseStatus.WAITING_FOR_SPECIALIST),
                )
            )
            .order_by(ReviewCase.updated_at.desc(), ReviewCase.id.desc())
        )
    )


def specialist_case(db: Session, specialist: User, case_id: int) -> ReviewCase:
    """A case this specialist may open: untaken, or taken by them. Others look not found."""
    case = db.get(ReviewCase, case_id)
    if case is None or case.specialist_id not in (None, specialist.id):
        raise not_found()
    return case


def claimable_case(db: Session, case_id: int) -> ReviewCase:
    """Any existing case: someone trying to take a case that was just taken by another
    specialist is told so (409), rather than finding it has vanished."""
    case = db.get(ReviewCase, case_id)
    if case is None:
        raise not_found()
    return case


def claim(db: Session, specialist: User, case: ReviewCase) -> ReviewCase:
    if case.specialist_id not in (None, specialist.id):
        raise ApiError(409, "already_assigned", "Another specialist has taken this case.")
    if case.specialist_id is None:
        case.specialist_id = specialist.id
        _touch(case)
        db.commit()
        db.refresh(case)
    return case


def ask(db: Session, specialist: User, case: ReviewCase, body: str) -> ReviewCase:
    if case.status == CaseStatus.ANSWERED:
        raise _closed()
    claim(db, specialist, case)
    db.add(CaseMessage(case_id=case.id, author_id=specialist.id, kind="question", body=body))
    case.status = CaseStatus.WAITING_FOR_GROWER
    _touch(case)
    notifications.notify(db, _grower(case).id, "question_asked", case)
    db.commit()
    db.refresh(case)
    return case


def give_feedback(db: Session, specialist: User, case: ReviewCase, payload: FeedbackIn, catalog: Catalog) -> ReviewCase:
    if case.status == CaseStatus.ANSWERED:
        raise _closed()
    _check_feedback(payload, catalog)
    claim(db, specialist, case)
    db.add(
        CaseFeedback(
            case_id=case.id,
            specialist_id=specialist.id,
            outcome=payload.outcome,
            category_key=payload.category_key,
            other_pest=payload.other_pest,
            message=payload.message,
        )
    )
    case.status = CaseStatus.ANSWERED
    _touch(case)
    notifications.notify(db, _grower(case).id, "feedback_sent", case)
    db.commit()
    db.refresh(case)
    return case


def _check_feedback(payload: FeedbackIn, catalog: Catalog) -> None:
    if payload.outcome == "inconclusive":
        if payload.category_key is not None:
            raise validation_error({"category_key": "invalid"})
        if payload.other_pest is not None:
            raise validation_error({"other_pest": "invalid"})
        return
    if payload.category_key is None and payload.other_pest is None:
        raise validation_error({"category_key": "required"})
    if payload.category_key is not None and payload.other_pest is not None:
        raise validation_error({"other_pest": "invalid"})
    if payload.category_key is not None and payload.category_key not in catalog:
        raise validation_error({"category_key": "invalid"})


# Responses ----------------------------------------------------------------------------------


def _messages(case: ReviewCase) -> list[MessageOut]:
    return [
        MessageOut(id=m.id, kind=m.kind, body=m.body, author_name=m.author.full_name, created_at=m.created_at)
        for m in case.messages
    ]


def _feedback(case: ReviewCase, catalog: Catalog) -> FeedbackOut | None:
    feedback = case.feedback
    if feedback is None:
        return None
    pest = catalog.get(feedback.category_key) if feedback.category_key else None
    analysis = case.observation.analysis
    matches = bool(
        feedback.category_key
        and analysis is not None
        and analysis.outcome == "identified"
        and analysis.category_key == feedback.category_key
    )
    return FeedbackOut(
        outcome=feedback.outcome,
        category=PestRef(key=pest.key, name=pest.name) if pest else None,
        other_pest=feedback.other_pest,
        message=feedback.message,
        specialist_name=feedback.specialist.full_name,
        matches_suggestion=matches,
        created_at=feedback.created_at,
    )


def grower_out(case: ReviewCase, catalog: Catalog) -> GrowerCaseOut:
    return GrowerCaseOut(
        id=case.id,
        observation_id=case.observation_id,
        status=case.status,
        note=case.note,
        specialist_name=case.specialist.full_name if case.specialist else None,
        messages=_messages(case),
        feedback=_feedback(case, catalog),
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def summary_out(case: ReviewCase) -> ReviewSummaryOut:
    observation = case.observation
    return ReviewSummaryOut(
        id=case.id,
        observation_id=observation.id,
        status=case.status,
        plant_name=observation.plant.name,
        observed_on=observation.observed_on,
        thumb_url=thumb_url(observation.id),
        updated_at=case.updated_at,
    )


def _case_photo_url(case: ReviewCase, variant: str | None = None) -> str:
    url = f"/api/specialist/cases/{case.id}/photo"
    return f"{url}?variant={variant}" if variant else url


def _suggestion(case: ReviewCase) -> SuggestionOut | None:
    analysis = case.observation.analysis
    if analysis is None:
        return None
    top = analysis.predictions[0] if analysis.outcome == "identified" else {}
    return SuggestionOut(
        outcome=analysis.outcome, key=top.get("key"), name=top.get("name"), confidence=analysis.confidence
    )


def queue_item_out(case: ReviewCase, specialist: User) -> QueueItemOut:
    observation = case.observation
    return QueueItemOut(
        id=case.id,
        status=case.status,
        assigned_to_me=case.specialist_id == specialist.id,
        plant_name=observation.plant.name,
        grower_name=_grower(case).full_name,
        observed_on=observation.observed_on,
        suggestion=_suggestion(case),
        thumb_url=_case_photo_url(case, "thumb"),
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def specialist_out(case: ReviewCase, specialist: User, catalog: Catalog) -> SpecialistCaseOut:
    observation, plant = case.observation, case.observation.plant
    return SpecialistCaseOut(
        id=case.id,
        status=case.status,
        assigned_to_me=case.specialist_id == specialist.id,
        note=case.note,
        grower_name=_grower(case).full_name,
        plant=CasePlantOut(name=plant.name, plant_type=plant.plant_type, location=plant.location),
        observation=CaseObservationOut(
            id=observation.id,
            observed_on=observation.observed_on,
            notes=observation.notes,
            photo_url=_case_photo_url(case),
            thumb_url=_case_photo_url(case, "thumb"),
            photo_width=observation.photo_width,
            photo_height=observation.photo_height,
        ),
        analysis=analysis_service.to_out(observation.analysis),
        messages=_messages(case),
        feedback=_feedback(case, catalog),
        created_at=case.created_at,
        updated_at=case.updated_at,
    )
