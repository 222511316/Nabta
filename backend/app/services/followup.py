"""Follow-up on a plant: tasks with in-app reminders (US18) and dated personal notes (US19)."""

from datetime import UTC, date, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.errors import validation_error
from app.models import Note, Notification, Plant, Task, User
from app.pests import Catalog
from app.schemas.followup import NoteIn, NoteOut, NotePatch, TaskIn, TaskOut, TaskPatch
from app.schemas.observations import PestRef
from app.services.observations import check_date
from app.services.plants import not_found


# Tasks -----------------------------------------------------------------------------------------


def task_out(task: Task, catalog: Catalog, language: str = "en") -> TaskOut:
    pest = catalog.get(task.pest_key, language) if task.pest_key else None
    return TaskOut(
        id=task.id,
        plant_id=task.plant_id,
        plant_name=task.plant.name,
        observation_id=task.observation_id,
        pest=PestRef(key=pest.key, name=pest.name) if pest else None,
        title=task.title,
        notes=task.notes,
        due_on=task.due_on,
        done=task.done_at is not None,
        done_at=task.done_at,
        created_at=task.created_at,
    )


def create_task(db: Session, plant: Plant, task_in: TaskIn, catalog: Catalog) -> Task:
    if task_in.observation_id is not None and task_in.observation_id not in {o.id for o in plant.observations}:
        raise validation_error({"observation_id": "invalid"})
    if task_in.pest_key is not None and task_in.pest_key not in catalog:
        raise validation_error({"pest_key": "invalid"})
    task = Task(
        plant_id=plant.id,
        observation_id=task_in.observation_id,
        pest_key=task_in.pest_key,
        title=task_in.title,
        notes=task_in.notes,
        due_on=task_in.due_on,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def owned_task(db: Session, grower: User, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.plant.owner_id != grower.id:
        raise not_found()
    return task


def update_task(db: Session, task: Task, patch: TaskPatch) -> Task:
    sent = patch.model_fields_set
    if "title" in sent and patch.title is not None:
        task.title = patch.title
    if "notes" in sent:
        task.notes = patch.notes
    if "due_on" in sent and patch.due_on != task.due_on:
        task.due_on = patch.due_on
        # A new date earns a new reminder; the old one would point at the wrong day.
        task.reminded_at = None
        db.execute(delete(Notification).where(Notification.task_id == task.id))
    if "done" in sent and patch.done is not None:
        task.done_at = (task.done_at or utcnow()) if patch.done else None
    db.commit()
    db.refresh(task)
    return task


def grower_tasks(db: Session, grower: User, status: str = "all", plant_id: int | None = None) -> list[Task]:
    query = select(Task).join(Plant).where(Plant.owner_id == grower.id)
    if plant_id is not None:
        query = query.where(Task.plant_id == plant_id)
    if status == "open":
        query = query.where(Task.done_at.is_(None))
    elif status == "done":
        query = query.where(Task.done_at.is_not(None))
    tasks = list(db.scalars(query))
    # Open tasks first, soonest due first and undated last; then done ones, latest first.
    return sorted(
        tasks,
        key=lambda t: (
            t.done_at is not None,
            t.due_on is None,
            t.due_on or date.max,
            -(t.done_at.timestamp() if t.done_at else 0),
            t.id,
        ),
    )


def trusted_today(claimed: date | None) -> date:
    """The grower's own date, sent by their browser, if it is within a day of the server's.
    Saudi Arabia is three hours ahead of UTC, so its "today" can be the server's tomorrow."""
    server = datetime.now(UTC).date()
    if claimed is not None and abs((claimed - server).days) <= 1:
        return claimed
    return server


def send_due_reminders(db: Session, grower: User, today: date) -> None:
    """One in-app reminder per open task once its due date arrives (US18)."""
    due = db.scalars(
        select(Task)
        .join(Plant)
        .where(
            Plant.owner_id == grower.id,
            Task.done_at.is_(None),
            Task.reminded_at.is_(None),
            Task.due_on.is_not(None),
            Task.due_on <= today,
        )
    ).all()
    for task in due:
        db.add(Notification(user_id=grower.id, kind="task_due", task_id=task.id))
        task.reminded_at = utcnow()
    if due:
        db.commit()


# Notes ------------------------------------------------------------------------------------------


def note_out(note: Note) -> NoteOut:
    return NoteOut(
        id=note.id,
        plant_id=note.plant_id,
        noted_on=note.noted_on,
        body=note.body,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def plant_notes(db: Session, plant: Plant) -> list[Note]:
    return list(
        db.scalars(select(Note).where(Note.plant_id == plant.id).order_by(Note.noted_on.desc(), Note.id.desc()))
    )


def create_note(db: Session, plant: Plant, note_in: NoteIn) -> Note:
    check_date(note_in.noted_on, "noted_on")
    note = Note(plant_id=plant.id, noted_on=note_in.noted_on, body=note_in.body)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def owned_note(db: Session, grower: User, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if note is None or note.plant.owner_id != grower.id:
        raise not_found()
    return note


def update_note(db: Session, note: Note, patch: NotePatch) -> Note:
    if patch.noted_on is not None:
        check_date(patch.noted_on, "noted_on")
        note.noted_on = patch.noted_on
    if patch.body is not None:
        note.body = patch.body
    db.commit()
    db.refresh(note)
    return note


def counts_for_today(tasks: list[Task], today: date) -> tuple[int, int]:
    """(overdue, due today) among open tasks."""
    open_tasks = [t for t in tasks if t.done_at is None and t.due_on is not None]
    return (
        sum(1 for t in open_tasks if t.due_on < today),
        sum(1 for t in open_tasks if t.due_on == today),
    )

