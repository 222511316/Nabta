"""US12, US13, US15: a grower asks for a specialist review, follows it and replies."""

from fastapi import APIRouter

from app.deps import DbSession, Grower, PestCatalog
from app.schemas.reviews import GrowerCaseOut, MessageIn, ReviewRequestIn, ReviewSummaryOut
from app.services import observations, reviews
from app.services.plants import not_found

router = APIRouter(tags=["reviews"])


@router.post("/api/observations/{observation_id}/review", status_code=201, response_model=GrowerCaseOut)
def request_review(
    observation_id: int, payload: ReviewRequestIn, grower: Grower, db: DbSession, catalog: PestCatalog
) -> GrowerCaseOut:
    observation = observations.get_owned_observation(db, grower, observation_id)
    return reviews.grower_out(reviews.request_review(db, observation, payload.note), catalog)


@router.get("/api/observations/{observation_id}/review", response_model=GrowerCaseOut)
def get_review(observation_id: int, grower: Grower, db: DbSession, catalog: PestCatalog) -> GrowerCaseOut:
    observation = observations.get_owned_observation(db, grower, observation_id)
    if observation.review is None:
        raise not_found()
    return reviews.grower_out(observation.review, catalog)


@router.get("/api/reviews", response_model=list[ReviewSummaryOut])
def list_reviews(grower: Grower, db: DbSession) -> list[ReviewSummaryOut]:
    return [reviews.summary_out(case) for case in reviews.grower_cases(db, grower)]


@router.post("/api/reviews/{case_id}/replies", status_code=201, response_model=GrowerCaseOut)
def reply(case_id: int, payload: MessageIn, grower: Grower, db: DbSession, catalog: PestCatalog) -> GrowerCaseOut:
    case = reviews.grower_case(db, grower, case_id)
    return reviews.grower_out(reviews.reply(db, grower, case, payload.body), catalog)
