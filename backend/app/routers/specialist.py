"""US08, US14–US16: the specialist workspace and its review cases. Approved specialists only."""

from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.deps import AppSettings, ApprovedSpecialist, DbSession, PestCatalog, require_approved_specialist
from app.schemas.reviews import FeedbackIn, MessageIn, QueueItemOut, SpecialistCaseOut
from app.services import reviews
from app.services.plants import not_found

# The router-wide check makes approval impossible to forget on a new route (FR12, NFR05).
router = APIRouter(
    prefix="/api/specialist", tags=["specialist"], dependencies=[Depends(require_approved_specialist)]
)


@router.get("/cases", response_model=list[QueueItemOut])
def list_cases(specialist: ApprovedSpecialist, db: DbSession) -> list[QueueItemOut]:
    return [reviews.queue_item_out(case, specialist) for case in reviews.queue(db, specialist)]


@router.get("/cases/{case_id}", response_model=SpecialistCaseOut)
def get_case(case_id: int, specialist: ApprovedSpecialist, db: DbSession, catalog: PestCatalog) -> SpecialistCaseOut:
    return reviews.specialist_out(reviews.specialist_case(db, specialist, case_id), specialist, catalog)


@router.post("/cases/{case_id}/claim", response_model=SpecialistCaseOut)
def claim_case(case_id: int, specialist: ApprovedSpecialist, db: DbSession, catalog: PestCatalog) -> SpecialistCaseOut:
    case = reviews.claim(db, specialist, reviews.claimable_case(db, case_id))
    return reviews.specialist_out(case, specialist, catalog)


@router.post("/cases/{case_id}/questions", status_code=201, response_model=SpecialistCaseOut)
def ask_question(
    case_id: int, payload: MessageIn, specialist: ApprovedSpecialist, db: DbSession, catalog: PestCatalog
) -> SpecialistCaseOut:
    case = reviews.ask(db, specialist, reviews.specialist_case(db, specialist, case_id), payload.body)
    return reviews.specialist_out(case, specialist, catalog)


@router.post("/cases/{case_id}/feedback", status_code=201, response_model=SpecialistCaseOut)
def give_feedback(
    case_id: int, payload: FeedbackIn, specialist: ApprovedSpecialist, db: DbSession, catalog: PestCatalog
) -> SpecialistCaseOut:
    case = reviews.give_feedback(db, specialist, reviews.specialist_case(db, specialist, case_id), payload, catalog)
    return reviews.specialist_out(case, specialist, catalog)


@router.get("/cases/{case_id}/photo", response_class=FileResponse)
def case_photo(
    case_id: int,
    specialist: ApprovedSpecialist,
    db: DbSession,
    settings: AppSettings,
    variant: Literal["full", "thumb"] = "full",
) -> FileResponse:
    """The observation photo, for specialists permitted to review this case (NFR06)."""
    observation = reviews.specialist_case(db, specialist, case_id).observation
    path = settings.photos_dir / (observation.thumb_filename if variant == "thumb" else observation.photo_filename)
    if not path.is_file():
        raise not_found()
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
