"""Plant profiles and their dashboard summaries (US05, US07)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Observation, Plant, User
from app.schemas.plants import PlantOut


def not_found() -> ApiError:
    return ApiError(404, "not_found", "The requested resource was not found.")


def get_owned_plant(db: Session, owner: User, plant_id: int) -> Plant:
    """Another grower's plant answers exactly like a missing one, so ids can't be probed."""
    plant = db.get(Plant, plant_id)
    if plant is None or plant.owner_id != owner.id:
        raise not_found()
    return plant


def thumb_url(observation_id: int) -> str:
    return f"/api/observations/{observation_id}/photo?variant=thumb"


def _observation_stats(db: Session, plant_ids: list[int]) -> dict:
    """Per plant: observation count, latest sighting, latest save."""
    rows = db.execute(
        select(
            Observation.plant_id,
            func.count().label("count"),
            func.max(Observation.observed_on).label("last_observed_on"),
            func.max(Observation.created_at).label("last_saved_at"),
        )
        .where(Observation.plant_id.in_(plant_ids))
        .group_by(Observation.plant_id)
    )
    return {row.plant_id: row for row in rows}


def _cover_observation_ids(db: Session, plant_ids: list[int]) -> dict[int, int]:
    """Per plant: the id of its most recent sighting (latest date, then latest saved)."""
    position = (
        func.row_number()
        .over(
            partition_by=Observation.plant_id,
            order_by=(Observation.observed_on.desc(), Observation.created_at.desc(), Observation.id.desc()),
        )
        .label("position")
    )
    ranked = (
        select(Observation.plant_id, Observation.id, position)
        .where(Observation.plant_id.in_(plant_ids))
        .subquery()
    )
    return dict(db.execute(select(ranked.c.plant_id, ranked.c.id).where(ranked.c.position == 1)).all())


def _summaries(db: Session, plants: list[Plant]) -> list[tuple[Plant, PlantOut, object]]:
    ids = [plant.id for plant in plants]
    stats = _observation_stats(db, ids)
    covers = _cover_observation_ids(db, ids)
    results = []
    for plant in plants:
        row = stats.get(plant.id)
        summary = PlantOut(
            id=plant.id,
            name=plant.name,
            plant_type=plant.plant_type,
            location=plant.location,
            notes=plant.notes,
            created_at=plant.created_at,
            updated_at=plant.updated_at,
            observation_count=row.count if row else 0,
            last_observed_on=row.last_observed_on if row else None,
            cover_photo_url=thumb_url(covers[plant.id]) if plant.id in covers else None,
        )
        last_activity = row.last_saved_at if row else plant.created_at
        results.append((plant, summary, last_activity))
    return results


def summarize(db: Session, plant: Plant) -> PlantOut:
    return _summaries(db, [plant])[0][1]


def list_for_owner(db: Session, owner: User) -> list[PlantOut]:
    """The grower's plants, latest activity first: newest saved observation, else when added."""
    plants = list(db.scalars(select(Plant).where(Plant.owner_id == owner.id)))
    ordered = sorted(_summaries(db, plants), key=lambda item: (item[2], item[0].id), reverse=True)
    return [summary for _plant, summary, _activity in ordered]
