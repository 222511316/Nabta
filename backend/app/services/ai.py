"""Nabta's AI features: what is sent to the language model, and what comes back.

Privacy (NFR06): only text leaves Nabta, never photos, names or email addresses. People appear
as "grower" and "specialist". Grounding (NFR14, R05): the model gets Nabta's own records and
the reviewed pest pages, and the next steps it suggests must cite one of those pages.
"""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import prompts
from app.errors import ApiError
from app.models import Analysis, CaseStatus, Plant, PlantReport, ReviewCase, Role, User
from app.pests import Catalog, Pest
from app.schemas.ai import DraftIn, PlantReportOut, ReportEventOut, ReportStepOut, QuestionIn
from app.schemas.observations import PestRef
from app.services.observations import get_owned_observation
from app.services.plants import not_found

logger = logging.getLogger(__name__)

MAX_STEPS = 3


def _write(writer, task: str, instructions: str, facts: dict, output_type, language: str = "en"):
    if writer is None:
        raise ApiError(503, "ai_unavailable", "AI features aren't set up.")
    if language == "ar":
        instructions = f"{instructions}\n\n{prompts.IN_ARABIC}"
    try:
        return writer.write(task, instructions, facts, output_type)
    except Exception:
        logger.exception("The AI couldn't write %s", task)
        raise ApiError(503, "ai_failed", "The AI couldn't write this right now. Please try again.") from None


# What the model is told -------------------------------------------------------------------


def _guide(pest: Pest) -> dict:
    """A reviewed pest page, as the model sees it."""
    return {
        "key": pest.key,
        "name": pest.name,
        "summary": pest.summary,
        "look_for": list(pest.look_for),
        "size": pest.size,
        "where": pest.where,
        "damage": pest.damage,
        "look_alikes": pest.look_alikes,
        "what_you_can_do": [step.text for step in pest.guidance],
        "source": "; ".join(f"{source.publisher}: {source.title}" for source in pest.sources),
        "reviewed_by_specialist": pest.review.status == "reviewed",
    }


def _guides(keys: list[str], catalog: Catalog, language: str = "en") -> list[dict]:
    unique = dict.fromkeys(key for key in keys if key and key in catalog)
    return [_guide(catalog.get(key, language)) for key in unique]


def _nabta(analysis: Analysis | None) -> dict | None:
    if analysis is None:
        return None
    if analysis.outcome == "identified":
        return {"result": "identified", "pest": analysis.predictions[0]["name"], "confidence": round(analysis.confidence, 2)}
    return {
        "result": "unclear",
        "reason": analysis.unclear_reason,
        "closest": [prediction["name"] for prediction in analysis.predictions[:2]],
    }


def _messages(case: ReviewCase) -> list[dict]:
    return [
        {
            "from": "specialist" if message.kind == "question" else "grower",
            "date": message.created_at.date().isoformat(),
            "text": message.body,
        }
        for message in case.messages
    ]


def _assessment(case: ReviewCase, catalog: Catalog) -> dict | None:
    feedback = case.feedback
    if feedback is None:
        return None
    pest = catalog.get(feedback.category_key) if feedback.category_key else None
    return {"outcome": feedback.outcome, "pest": pest.name if pest else feedback.other_pest, "message": feedback.message}


def _review(case: ReviewCase | None, catalog: Catalog) -> dict | None:
    if case is None:
        return None
    return {
        "status": case.status,
        "request_note": case.note,
        "messages": _messages(case),
        "assessment": _assessment(case, catalog),
    }


# Plant reports (growers) -----------------------------------------------------------------------


def report_facts(plant: Plant, catalog: Catalog, language: str = "en") -> dict:
    observations = sorted(plant.observations, key=lambda o: (o.observed_on, o.id))
    pests = []
    for observation in observations:
        if observation.analysis and observation.analysis.outcome == "identified":
            pests.append(observation.analysis.category_key)
        if observation.review and observation.review.feedback:
            pests.append(observation.review.feedback.category_key)
    return {
        "today": date.today().isoformat(),
        "plant": {"name": plant.name, "type": plant.plant_type, "location": plant.location, "notes": plant.notes},
        "observations": [
            {
                "date": observation.observed_on.isoformat(),
                "notes": observation.notes,
                "nabta": _nabta(observation.analysis),
                "review": _review(observation.review, catalog),
            }
            for observation in observations
        ],
        "pest_guides": _guides(pests, catalog, language),
    }


def write_report(db: Session, plant: Plant, writer, catalog: Catalog, language: str = "en") -> PlantReport:
    facts = report_facts(plant, catalog, language)
    draft = _write(writer, "plant_report", prompts.PLANT_REPORT, facts, prompts.PlantReportDraft, language)
    given = {guide["key"] for guide in facts["pest_guides"]}
    content = {
        "summary": draft.summary.strip(),
        "timeline": [{"date": event.date, "text": event.text.strip()} for event in draft.timeline],
        "open_items": [item.strip() for item in draft.open_items if item.strip()],
        # A step may only cite a pest page the model was actually given.
        "next_steps": [
            {"text": step.text.strip(), "pest_key": step.pest_key if step.pest_key in given else None}
            for step in draft.next_steps[:MAX_STEPS]
        ],
    }
    report = PlantReport(plant_id=plant.id, content=content, model=writer.model)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def latest_report(db: Session, plant: Plant) -> PlantReport | None:
    return db.scalar(
        select(PlantReport)
        .where(PlantReport.plant_id == plant.id)
        .order_by(PlantReport.created_at.desc(), PlantReport.id.desc())
        .limit(1)
    )


def report_out(report: PlantReport, catalog: Catalog, language: str = "en") -> PlantReportOut:
    content = report.content

    def pest_ref(key: str | None) -> PestRef | None:
        pest = catalog.get(key, language) if key else None
        return PestRef(key=pest.key, name=pest.name) if pest else None

    return PlantReportOut(
        summary=content["summary"],
        timeline=[ReportEventOut(**event) for event in content["timeline"]],
        open_items=content["open_items"],
        next_steps=[ReportStepOut(text=step["text"], pest=pest_ref(step["pest_key"])) for step in content["next_steps"]],
        model=report.model,
        created_at=report.created_at,
    )


# Draft assessments (specialists) -----------------------------------------------------------------


def draft_assessment(case: ReviewCase, decision_in: DraftIn, writer, catalog: Catalog, language: str = "en") -> str:
    if case.status == CaseStatus.ANSWERED:
        raise ApiError(409, "case_closed", "This review has been answered and is closed.")
    decision = None
    if decision_in.outcome == "inconclusive":
        decision = {"outcome": "inconclusive", "pest": None}
    elif decision_in.outcome == "identified":
        pest = catalog.get(decision_in.category_key, language) if decision_in.category_key else None
        decision = {"outcome": "identified", "pest": pest.name if pest else decision_in.other_pest}

    observation, plant = case.observation, case.observation.plant
    analysis = observation.analysis
    suggested = [prediction["key"] for prediction in analysis.predictions] if analysis else []
    facts = {
        "plant": {"type": plant.plant_type, "location": plant.location},
        "observation": {"date": observation.observed_on.isoformat(), "notes": observation.notes},
        "request_note": case.note,
        "nabta": _nabta(analysis),
        "conversation": _messages(case),
        "decision": decision,
        "pest_guides": _guides([decision_in.category_key, *suggested], catalog, language),
    }
    draft = _write(writer, "assessment_draft", prompts.ASSESSMENT_DRAFT, facts, prompts.AssessmentDraft, language)
    return draft.message.strip()


# Questions about a pest (anyone signed in) -------------------------------------------------------


def answer_question(
    db: Session, user: User, pest: Pest, question: QuestionIn, writer, language: str = "en"
) -> prompts.PestAnswer:
    plant = None
    if question.observation_id is not None:
        # Context from the grower's own observation; nobody else's.
        if user.role != Role.GROWER:
            raise not_found()
        observed = get_owned_observation(db, user, question.observation_id).plant
        plant = {"type": observed.plant_type, "location": observed.location}
    facts = {"pest_guide": _guide(pest), "plant": plant, "question": question.question}
    return _write(writer, "pest_answer", prompts.PEST_ANSWER, facts, prompts.PestAnswer, language)
