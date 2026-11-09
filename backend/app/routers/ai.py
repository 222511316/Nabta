"""AI features (OpenAI): plant reports, specialist drafts, and questions about a pest.

All of them are optional: without an API key they answer 503 ai_unavailable.
"""

from fastapi import APIRouter

from app.deps import AiWriter, CurrentUser, DbSession, Grower, PestCatalog, Specialist
from app.schemas.ai import AiStatusOut, AnswerOut, DraftIn, DraftOut, PlantReportOut, QuestionIn
from app.services import ai, reviews
from app.services.plants import get_owned_plant, not_found

router = APIRouter(tags=["ai"])


@router.get("/api/ai", response_model=AiStatusOut)
def status(user: CurrentUser, writer: AiWriter) -> AiStatusOut:
    return AiStatusOut(enabled=writer is not None, model=writer.model if writer else None)


@router.get("/api/plants/{plant_id}/report", response_model=PlantReportOut)
def get_report(plant_id: int, grower: Grower, db: DbSession, catalog: PestCatalog) -> PlantReportOut:
    report = ai.latest_report(db, get_owned_plant(db, grower, plant_id))
    if report is None:
        raise not_found()
    return ai.report_out(report, catalog)


@router.post("/api/plants/{plant_id}/report", status_code=201, response_model=PlantReportOut)
def write_report(plant_id: int, grower: Grower, db: DbSession, catalog: PestCatalog, writer: AiWriter) -> PlantReportOut:
    report = ai.write_report(db, get_owned_plant(db, grower, plant_id), writer, catalog)
    return ai.report_out(report, catalog)


@router.post("/api/specialist/cases/{case_id}/draft", response_model=DraftOut)
def draft_assessment(
    case_id: int, payload: DraftIn, specialist: Specialist, db: DbSession, catalog: PestCatalog, writer: AiWriter
) -> DraftOut:
    case = reviews.specialist_case(db, specialist, case_id)
    return DraftOut(message=ai.draft_assessment(case, payload, writer, catalog), model=writer.model)


@router.post("/api/pests/{key}/questions", response_model=AnswerOut)
def ask_about_pest(
    key: str, payload: QuestionIn, user: CurrentUser, db: DbSession, catalog: PestCatalog, writer: AiWriter
) -> AnswerOut:
    pest = catalog.get(key)
    if pest is None:
        raise not_found()
    answer = ai.answer_question(db, user, pest, payload, writer)
    return AnswerOut(**answer.model_dump(), model=writer.model)
