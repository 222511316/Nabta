"""US05: a grower's plant profiles. Growers only; another grower's plant is "not found"."""

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import AppSettings, DbSession, Grower
from app.models import Observation, Plant
from app.schemas.plants import PlantIn, PlantOut, PlantPatch
from app.services import photos, plants

router = APIRouter(prefix="/api/plants", tags=["plants"])


@router.get("", response_model=list[PlantOut])
def list_plants(grower: Grower, db: DbSession) -> list[PlantOut]:
    return plants.list_for_owner(db, grower)


@router.post("", status_code=201, response_model=PlantOut)
def create_plant(payload: PlantIn, grower: Grower, db: DbSession) -> PlantOut:
    plant = Plant(owner_id=grower.id, **payload.model_dump())
    db.add(plant)
    db.commit()
    return plants.summarize(db, plant)


@router.get("/{plant_id}", response_model=PlantOut)
def get_plant(plant_id: int, grower: Grower, db: DbSession) -> PlantOut:
    return plants.summarize(db, plants.get_owned_plant(db, grower, plant_id))


@router.patch("/{plant_id}", response_model=PlantOut)
def update_plant(plant_id: int, payload: PlantPatch, grower: Grower, db: DbSession) -> PlantOut:
    plant = plants.get_owned_plant(db, grower, plant_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plant, field, value)
    db.commit()
    return plants.summarize(db, plant)


@router.delete("/{plant_id}", status_code=204)
def delete_plant(plant_id: int, grower: Grower, db: DbSession, settings: AppSettings) -> None:
    plant = plants.get_owned_plant(db, grower, plant_id)
    files = [
        name
        for photo, thumb in db.execute(
            select(Observation.photo_filename, Observation.thumb_filename).where(Observation.plant_id == plant.id)
        )
        for name in (photo, thumb)
    ]
    db.delete(plant)  # observations go with it (ON DELETE CASCADE)
    db.commit()
    # Only once the rows are gone: a failed commit must not lose photos still referenced.
    photos.delete_files(settings.photos_dir, files)
