"""US18 tasks, US19 notes, US21 search and the dashboard summary. Growers only, on their own records."""

from datetime import date

from fastapi import APIRouter

from app.deps import DbSession, Grower, Language, PestCatalog
from app.schemas.followup import (
    NoteIn,
    NoteOut,
    NotePatch,
    ResultFilter,
    SearchOut,
    SearchType,
    SummaryOut,
    TaskIn,
    TaskOut,
    TaskPatch,
    TaskStatus,
)
from app.services import followup, plants, search

router = APIRouter(tags=["follow-up"])


# Tasks -----------------------------------------------------------------------------------------


@router.get("/api/tasks", response_model=list[TaskOut])
def list_tasks(
    grower: Grower,
    db: DbSession,
    catalog: PestCatalog,
    language: Language,
    status: TaskStatus | None = None,
    plant_id: int | None = None,
) -> list[TaskOut]:
    if plant_id is not None:
        plants.get_owned_plant(db, grower, plant_id)
    tasks = followup.grower_tasks(db, grower, status=status or "all", plant_id=plant_id)
    return [followup.task_out(task, catalog, language) for task in tasks]


@router.post("/api/plants/{plant_id}/tasks", status_code=201, response_model=TaskOut)
def create_task(
    plant_id: int, payload: TaskIn, grower: Grower, db: DbSession, catalog: PestCatalog, language: Language
) -> TaskOut:
    plant = plants.get_owned_plant(db, grower, plant_id)
    return followup.task_out(followup.create_task(db, plant, payload, catalog), catalog, language)


@router.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int, payload: TaskPatch, grower: Grower, db: DbSession, catalog: PestCatalog, language: Language
) -> TaskOut:
    task = followup.owned_task(db, grower, task_id)
    return followup.task_out(followup.update_task(db, task, payload), catalog, language)


@router.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, grower: Grower, db: DbSession) -> None:
    db.delete(followup.owned_task(db, grower, task_id))  # its reminder goes with it (ON DELETE CASCADE)
    db.commit()


# Notes -----------------------------------------------------------------------------------------


@router.get("/api/plants/{plant_id}/notes", response_model=list[NoteOut])
def list_notes(plant_id: int, grower: Grower, db: DbSession) -> list[NoteOut]:
    plant = plants.get_owned_plant(db, grower, plant_id)
    return [followup.note_out(note) for note in followup.plant_notes(db, plant)]


@router.post("/api/plants/{plant_id}/notes", status_code=201, response_model=NoteOut)
def create_note(plant_id: int, payload: NoteIn, grower: Grower, db: DbSession) -> NoteOut:
    plant = plants.get_owned_plant(db, grower, plant_id)
    return followup.note_out(followup.create_note(db, plant, payload))


@router.patch("/api/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: int, payload: NotePatch, grower: Grower, db: DbSession) -> NoteOut:
    note = followup.owned_note(db, grower, note_id)
    return followup.note_out(followup.update_note(db, note, payload))


@router.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int, grower: Grower, db: DbSession) -> None:
    db.delete(followup.owned_note(db, grower, note_id))
    db.commit()


# Search and summary ----------------------------------------------------------------------------


@router.get("/api/search", response_model=SearchOut)
def search_records(
    grower: Grower,
    db: DbSession,
    catalog: PestCatalog,
    language: Language,
    q: str | None = None,
    type: SearchType = "all",  # noqa: A002 - the query parameter's public name
    result: ResultFilter | None = None,
    task_status: TaskStatus | None = None,
) -> SearchOut:
    return search.search(db, grower, catalog, language, q, type, result, task_status)


@router.get("/api/summary", response_model=SummaryOut)
def summary(grower: Grower, db: DbSession, today: date | None = None) -> SummaryOut:
    return search.summary(db, grower, followup.trusted_today(today))
