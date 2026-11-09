"""In-app notifications about review cases (US13, FR15) and tasks that have come due (US18).
No email: the charter asks for in-app."""

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import Notification, ReviewCase, User
from app.schemas.reviews import InboxOut, NotificationOut
from app.services.plants import not_found

INBOX_SIZE = 20


def notify(db: Session, user_id: int, kind: str, case: ReviewCase) -> None:
    db.add(Notification(user_id=user_id, kind=kind, case_id=case.id))


def _out(notification: Notification) -> NotificationOut:
    if notification.kind == "task_due":
        task = notification.task
        return NotificationOut(
            id=notification.id,
            kind=notification.kind,
            case_id=None,
            task_id=task.id,
            task_title=task.title,
            plant_name=task.plant.name,
            actor_name="",
            link=f"/plants/{task.plant_id}?tab=tasks",
            read=notification.read_at is not None,
            created_at=notification.created_at,
        )
    case = notification.case
    grower = case.observation.plant.owner
    if notification.kind == "grower_replied":
        actor, link = grower, f"/specialist/cases/{case.id}"
    else:  # question_asked, feedback_sent: from the specialist, to the grower
        actor, link = case.specialist, f"/observations/{case.observation_id}"
    return NotificationOut(
        id=notification.id,
        kind=notification.kind,
        case_id=case.id,
        plant_name=case.observation.plant.name,
        actor_name=actor.full_name if actor else "",
        link=link,
        read=notification.read_at is not None,
        created_at=notification.created_at,
    )


def inbox(db: Session, user: User) -> InboxOut:
    items = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(INBOX_SIZE)
    ).all()
    unread = db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return InboxOut(unread=unread, items=[_out(item) for item in items])


def mark_read(db: Session, user: User, notification_id: int) -> None:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise not_found()
    if notification.read_at is None:
        notification.read_at = utcnow()
        db.commit()


def mark_all_read(db: Session, user: User) -> None:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
