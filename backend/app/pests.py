"""The pest categories Nabta knows, with their reference content (US11).

Content lives in content/pests/ next to the code, so it is versioned and reviewed like code.
Each entry records its sources and review status (NFR14): "awaiting_review" until a specialist
on the team checks it, then "reviewed" with their name and the date.
"""

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent.parent / "content" / "pests"
REVIEW_STATUSES = ("awaiting_review", "reviewed")


@dataclass(frozen=True)
class Source:
    title: str
    publisher: str
    url: str


@dataclass(frozen=True)
class Review:
    status: str
    reviewed_by: str | None
    reviewed_on: date | None


@dataclass(frozen=True)
class ReferenceImage:
    file: str
    caption: str
    credit: str


@dataclass(frozen=True)
class Pest:
    key: str
    name: str
    summary: str
    look_for: tuple[str, ...]
    size: str | None
    where: str
    damage: str
    look_alikes: str
    sources: tuple[Source, ...]
    review: Review
    images: tuple[ReferenceImage, ...]

    def image(self, filename: str) -> ReferenceImage | None:
        """Only the photos listed for this pest are ever served."""
        return next((image for image in self.images if image.file == filename), None)


class Catalog:
    def __init__(self, pests: list[Pest], images_dir: Path):
        self.pests = pests
        self.images_dir = images_dir
        self._by_key = {pest.key: pest for pest in pests}

    def get(self, key: str) -> Pest | None:
        return self._by_key.get(key)

    def __contains__(self, key: str) -> bool:
        return key in self._by_key


def _pest(entry: dict) -> Pest:
    review = entry["review"]
    return Pest(
        key=entry["key"],
        name=entry["name"],
        summary=entry["summary"],
        look_for=tuple(entry["look_for"]),
        size=entry.get("size"),
        where=entry["where"],
        damage=entry["damage"],
        look_alikes=entry["look_alikes"],
        sources=tuple(Source(**source) for source in entry["sources"]),
        review=Review(
            status=review["status"],
            reviewed_by=review["reviewed_by"],
            reviewed_on=date.fromisoformat(review["reviewed_on"]) if review["reviewed_on"] else None,
        ),
        images=tuple(ReferenceImage(**image) for image in entry["images"]),
    )


def _problems(pest: Pest, images_dir: Path) -> list[str]:
    problems = []
    if not pest.sources:
        problems.append("no source")
    if pest.review.status not in REVIEW_STATUSES:
        problems.append(f"unknown review status {pest.review.status!r}")
    if pest.review.status == "reviewed" and not (pest.review.reviewed_by and pest.review.reviewed_on):
        problems.append("reviewed without a reviewer and date")
    for image in pest.images:
        if Path(image.file).name != image.file or not (images_dir / image.file).is_file():
            problems.append(f"missing photo {image.file!r}")
    return problems


def load_catalog(content_dir: Path = CONTENT_DIR) -> Catalog:
    """Reads and checks the content; a broken entry stops the app from starting."""
    raw = json.loads((content_dir / "catalog.json").read_text(encoding="utf-8"))
    pests = [_pest(entry) for entry in raw["pests"]]
    images_dir = content_dir / "images"
    problems = [f"{pest.key}: {problem}" for pest in pests for problem in _problems(pest, images_dir)]
    if problems:
        raise ValueError("Pest content is invalid: " + "; ".join(problems))
    return Catalog(pests, images_dir)
