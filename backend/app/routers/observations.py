"""US06: saving and viewing photo observations. Growers only, on their own plants."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Response, UploadFile
from fastapi.responses import FileResponse

from app.deps import AppSettings, DbSession, Grower
from app.schemas.observations import ObservationOut
from app.services import observations, photos, plants

router = APIRouter(tags=["observations"])

REQUEST_ID_PATTERN = r"^[A-Za-z0-9-]{8,64}$"


@router.get("/api/plants/{plant_id}/observations", response_model=list[ObservationOut])
def list_observations(plant_id: int, grower: Grower, db: DbSession) -> list[ObservationOut]:
    plant = plants.get_owned_plant(db, grower, plant_id)
    return [observations.to_out(item) for item in observations.list_for_plant(db, plant)]


@router.post("/api/plants/{plant_id}/observations", status_code=201, response_model=ObservationOut)
def create_observation(
    plant_id: int,
    photo: Annotated[UploadFile, File()],
    observed_on: Annotated[date, Form()],
    grower: Grower,
    db: DbSession,
    settings: AppSettings,
    response: Response,
    notes: Annotated[str | None, Form(max_length=2000)] = None,
    client_request_id: Annotated[str | None, Form(pattern=REQUEST_ID_PATTERN)] = None,
) -> ObservationOut:
    plant = plants.get_owned_plant(db, grower, plant_id)
    observations.check_observed_on(observed_on)

    # A retry of a submission that was already saved gets the saved observation back.
    repeat = observations.find_repeat(db, grower, client_request_id)
    if repeat is not None:
        response.status_code = 200
        return observations.to_out(repeat)

    observation, created = observations.create_or_find_repeat(
        db,
        settings,
        plant,
        grower,
        photo_data=photos.read_upload(photo.file, settings.max_upload_bytes),
        observed_on=observed_on,
        notes=notes,
        client_request_id=client_request_id,
    )
    if not created:
        response.status_code = 200
    return observations.to_out(observation)


@router.get("/api/observations/{observation_id}", response_model=ObservationOut)
def get_observation(observation_id: int, grower: Grower, db: DbSession) -> ObservationOut:
    return observations.to_out(observations.get_owned_observation(db, grower, observation_id))


@router.get("/api/observations/{observation_id}/photo", response_class=FileResponse)
def get_photo(
    observation_id: int,
    grower: Grower,
    db: DbSession,
    settings: AppSettings,
    variant: Literal["full", "thumb"] = "full",
) -> FileResponse:
    # Photos are only ever served through this ownership check, never from a public folder.
    observation = observations.get_owned_observation(db, grower, observation_id)
    filename = observation.thumb_filename if variant == "thumb" else observation.photo_filename
    path = settings.photos_dir / filename
    if not path.is_file():
        raise plants.not_found()
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
