"""Photo observations on a grower's plants (US06, FR10)."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import ApiError, validation_error
from app.models import Observation, Plant, User
from app.schemas.observations import ObservationOut
from app.services import photos
from app.services.plants import not_found, thumb_url

EARLIEST_DATE = date(2000, 1, 1)


def to_out(observation: Observation) -> ObservationOut:
    return ObservationOut(
        id=observation.id,
        plant_id=observation.plant_id,
        plant_name=observation.plant.name,
        observed_on=observation.observed_on,
        notes=observation.notes,
        photo_url=f"/api/observations/{observation.id}/photo",
        thumb_url=thumb_url(observation.id),
        photo_width=observation.photo_width,
        photo_height=observation.photo_height,
        created_at=observation.created_at,
    )


def get_owned_observation(db: Session, owner: User, observation_id: int) -> Observation:
    observation = db.get(Observation, observation_id)
    if observation is None or observation.plant.owner_id != owner.id:
        raise not_found()
    return observation


def list_for_plant(db: Session, plant: Plant) -> list[Observation]:
    return list(
        db.scalars(
            select(Observation)
            .where(Observation.plant_id == plant.id)
            .order_by(Observation.observed_on.desc(), Observation.created_at.desc(), Observation.id.desc())
        )
    )


def check_observed_on(observed_on: date) -> None:
    # "Tomorrow" in UTC is allowed: in Saudi Arabia (UTC+3) the day starts before UTC's.
    if observed_on > datetime.now(UTC).date() + timedelta(days=1):
        raise validation_error({"observed_on": "future_date"})
    if observed_on < EARLIEST_DATE:
        raise validation_error({"observed_on": "too_early"})


def find_repeat(db: Session, owner: User, client_request_id: str | None) -> Observation | None:
    """The observation already saved for this submission, if the browser is retrying one."""
    if not client_request_id:
        return None
    existing = db.scalars(
        select(Observation).where(Observation.client_request_id == client_request_id)
    ).first()
    if existing is not None and existing.plant.owner_id != owner.id:
        raise ApiError(409, "duplicate_request", "This request id has already been used.")
    return existing


def create(
    db: Session,
    settings: Settings,
    plant: Plant,
    *,
    photo_data: bytes,
    observed_on: date,
    notes: str | None,
    client_request_id: str | None,
) -> Observation:
    stored = photos.store_photo(photo_data, settings.photos_dir)
    observation = Observation(
        plant_id=plant.id,
        observed_on=observed_on,
        notes=(notes or "").strip() or None,
        photo_filename=stored.filename,
        thumb_filename=stored.thumb_filename,
        photo_width=stored.width,
        photo_height=stored.height,
        client_request_id=client_request_id,
    )
    db.add(observation)
    try:
        db.commit()
    except Exception:
        # Files are written first; if the row can't be saved they must not linger (NFR08).
        db.rollback()
        photos.delete_files(settings.photos_dir, [stored.filename, stored.thumb_filename])
        raise
    return observation


def create_or_find_repeat(db: Session, settings: Settings, plant: Plant, owner: User, **fields) -> tuple[Observation, bool]:
    """Returns (observation, created). A concurrent retry that loses the race gets the winner's row."""
    try:
        return create(db, settings, plant, **fields), True
    except IntegrityError:
        existing = find_repeat(db, owner, fields["client_request_id"])
        if existing is None:
            raise
        return existing, False
