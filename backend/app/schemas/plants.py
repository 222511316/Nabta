from datetime import date

from pydantic import BaseModel, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import UtcTimestamp, optional_text, required_text

PlantName = required_text(80)
PlantType = optional_text(80)
Location = optional_text(120)
PlantNotes = optional_text(1000)


class PlantIn(BaseModel):
    name: PlantName
    plant_type: PlantType = None
    location: Location = None
    notes: PlantNotes = None


class PlantPatch(BaseModel):
    """Only the fields sent are changed; null or "" clears an optional field."""

    name: PlantName | None = None
    plant_type: PlantType = None
    location: Location = None
    notes: PlantNotes = None

    @field_validator("name", mode="before")
    @classmethod
    def name_cannot_be_cleared(cls, value):
        # Runs only when "name" is sent, so an explicit null is refused but omission is fine.
        if value is None:
            raise PydanticCustomError("required", "This field is required.")
        return value


class PlantOut(BaseModel):
    id: int
    name: str
    plant_type: str | None
    location: str | None
    notes: str | None
    created_at: UtcTimestamp
    updated_at: UtcTimestamp
    observation_count: int
    last_observed_on: date | None
    cover_photo_url: str | None
