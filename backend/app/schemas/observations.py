from datetime import date

from pydantic import BaseModel

from app.schemas.common import UtcTimestamp


class ObservationOut(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    observed_on: date
    notes: str | None
    photo_url: str
    thumb_url: str
    photo_width: int
    photo_height: int
    created_at: UtcTimestamp
