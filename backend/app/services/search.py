"""Search and summaries over one grower's records (US21, FR20).

A prototype's records are few, so matching runs in Python: case-insensitive, Unicode-aware
(Arabic included), and pests can be found by their English or Arabic names.
"""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Analysis, CaseStatus, Observation, Plant, ReviewCase, User
from app.pests import LANGUAGES, Catalog
from app.schemas.followup import NoteHit, ObservationHit, PlantHit, ResultOut, SearchOut, SummaryOut
from app.schemas.observations import PestRef
from app.services import followup
from app.services.plants import thumb_url

LIMIT = 25


def _pest_names(catalog: Catalog, key: str | None) -> list[str]:
    if not key or key not in catalog:
        return []
    return [catalog.get(key, language).name for language in LANGUAGES]


def _observation_pests(observation: Observation) -> list[str | None]:
    keys = []
    if observation.analysis and observation.analysis.outcome == "identified":
        keys.append(observation.analysis.category_key)
    if observation.review and observation.review.feedback:
        keys.append(observation.review.feedback.category_key)
    return keys


def _result(observation: Observation, catalog: Catalog, language: str) -> ResultOut | None:
    analysis = observation.analysis
    if analysis is None:
        return None
    pest = catalog.get(analysis.category_key, language) if analysis.category_key else None
    return ResultOut(outcome=analysis.outcome, pest=PestRef(key=pest.key, name=pest.name) if pest else None)


def search(
    db: Session,
    grower: User,
    catalog: Catalog,
    language: str,
    q: str | None,
    kind: str,
    result: str | None,
    task_status: str | None,
) -> SearchOut:
    needle = (q or "").strip().casefold()

    def matches(*fields) -> bool:
        return not needle or any(needle in field.casefold() for field in fields if field)

    def wanted(name: str) -> bool:
        # A result filter only applies to observations, a task state only to tasks.
        if result and name != "observations":
            return False
        if task_status and name != "tasks":
            return False
        return kind in ("all", name)

    out = SearchOut(plants=[], observations=[], tasks=[], notes=[])
    plants = list(db.scalars(select(Plant).where(Plant.owner_id == grower.id).order_by(Plant.name)))

    if wanted("plants"):
        out.plants = [
            PlantHit(id=p.id, name=p.name, plant_type=p.plant_type, location=p.location)
            for p in plants
            if matches(p.name, p.plant_type, p.location, p.notes)
        ][:LIMIT]

    if wanted("observations"):
        observations = sorted(
            (o for p in plants for o in p.observations), key=lambda o: (o.observed_on, o.id), reverse=True
        )
        for o in observations:
            names = [name for key in _observation_pests(o) for name in _pest_names(catalog, key)]
            if not matches(o.notes, o.plant.name, *names):
                continue
            if result == "identified" and not (o.analysis and o.analysis.outcome == "identified"):
                continue
            if result == "unclear" and not (o.analysis and o.analysis.outcome == "unclear"):
                continue
            if result == "review" and o.review is None:
                continue
            out.observations.append(
                ObservationHit(
                    id=o.id,
                    plant_id=o.plant_id,
                    plant_name=o.plant.name,
                    observed_on=o.observed_on,
                    notes=o.notes,
                    thumb_url=thumb_url(o.id),
                    result=_result(o, catalog, language),
                    review_status=o.review.status if o.review else None,
                )
            )
        out.observations = out.observations[:LIMIT]

    if wanted("tasks"):
        tasks = followup.grower_tasks(db, grower, status=task_status or "all")
        out.tasks = [
            followup.task_out(t, catalog, language)
            for t in tasks
            if matches(t.title, t.notes, t.plant.name, *_pest_names(catalog, t.pest_key))
        ][:LIMIT]

    if wanted("notes"):
        notes = sorted((n for p in plants for n in p.notes_log), key=lambda n: (n.noted_on, n.id), reverse=True)
        out.notes = [
            NoteHit(id=n.id, plant_id=n.plant_id, plant_name=n.plant.name, noted_on=n.noted_on, body=n.body)
            for n in notes
            if matches(n.body, n.plant.name)
        ][:LIMIT]
    return out


def summary(db: Session, grower: User, today: date) -> SummaryOut:
    open_tasks = followup.grower_tasks(db, grower, status="open")
    overdue, due_today = followup.counts_for_today(open_tasks, today)
    owned = select(Observation.id).join(Plant).where(Plant.owner_id == grower.id)
    waiting = db.scalar(
        select(func.count())
        .select_from(ReviewCase)
        .where(ReviewCase.observation_id.in_(owned), ReviewCase.status == CaseStatus.WAITING_FOR_GROWER)
    )
    unclear = db.scalar(
        select(func.count())
        .select_from(Analysis)
        .outerjoin(ReviewCase, ReviewCase.observation_id == Analysis.observation_id)
        .where(Analysis.observation_id.in_(owned), Analysis.outcome == "unclear", ReviewCase.id.is_(None))
    )
    return SummaryOut(
        tasks_overdue=overdue,
        tasks_due_today=due_today,
        reviews_waiting_for_you=waiting,
        unclear_not_reviewed=unclear,
        open_tasks=len(open_tasks),
    )
