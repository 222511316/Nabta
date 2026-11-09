"""US13, FR15, US18: in-app notifications for growers and specialists, and task reminders for growers."""

from datetime import date

from fastapi import APIRouter

from app.deps import CurrentUser, DbSession
from app.models import Role
from app.schemas.reviews import InboxOut
from app.services import followup, notifications

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=InboxOut)
def inbox(user: CurrentUser, db: DbSession, today: date | None = None) -> InboxOut:
    """today: the grower's own date from their browser, so reminders arrive on their day."""
    if user.role == Role.GROWER:
        followup.send_due_reminders(db, user, followup.trusted_today(today))
    elif user.specialist_status == "pending":
        # A revoked specialist's old notifications name growers and plants: hidden until approved again.
        return InboxOut(unread=0, items=[])
    return notifications.inbox(db, user)


@router.post("/read-all", status_code=204)
def mark_all_read(user: CurrentUser, db: DbSession) -> None:
    notifications.mark_all_read(db, user)


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, user: CurrentUser, db: DbSession) -> None:
    notifications.mark_read(db, user, notification_id)
