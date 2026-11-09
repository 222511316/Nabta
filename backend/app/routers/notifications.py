"""US13, FR15: in-app notifications for growers and specialists."""

from fastapi import APIRouter

from app.deps import CurrentUser, DbSession
from app.schemas.reviews import InboxOut
from app.services import notifications

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=InboxOut)
def inbox(user: CurrentUser, db: DbSession) -> InboxOut:
    return notifications.inbox(db, user)


@router.post("/read-all", status_code=204)
def mark_all_read(user: CurrentUser, db: DbSession) -> None:
    notifications.mark_all_read(db, user)


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, user: CurrentUser, db: DbSession) -> None:
    notifications.mark_read(db, user, notification_id)
