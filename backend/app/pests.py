"""The pest categories Nabta knows, with their reference content and guidance (US11, US17).

Content lives in content/pests/ next to the code, so it is versioned and reviewed like code.
Each entry records its sources and review status (NFR14): "awaiting_review" until a specialist
on the team checks it, then "reviewed" with their name and the date. Arabic versions sit next to
the English ones (US23, NFR04), with their own review status for the translation.
"""

import json
from dataclasses import dataclass, replace
from datetime import date
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent.parent / "content" / "pests"
REVIEW_STATUSES = ("awaiting_review", "reviewed")
GUIDANCE_KINDS = ("check", "prevent", "remove", "natural_enemies")
LANGUAGES = ("en", "ar")
TASK_TITLE_MAX = 120


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
class GuidanceStep:
    kind: str  # check, prevent, remove or natural_enemies
    task: str  # short enough to become a task title
    text: str


@dataclass(frozen=True)
class Translation:
    language: str
    status: str


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
    guidance: tuple[GuidanceStep, ...]
    translation: Translation | None = None  # set on a translated copy
    _translations: tuple = ()  # ((language, raw fields, status), ...)

    def image(self, filename: str) -> ReferenceImage | None:
        """Only the photos listed for this pest are ever served."""
        return next((image for image in self.images if image.file == filename), None)

    def in_language(self, language: str) -> "Pest":
        """This pest in `language`, or as written (English) when there's no such version."""
        for code, fields, status in self._translations:
            if code == language:
                return replace(
                    self,
                    name=fields["name"],
                    summary=fields["summary"],
                    look_for=tuple(fields["look_for"]),
                    size=fields.get("size", self.size),
                    where=fields["where"],
                    damage=fields["damage"],
                    look_alikes=fields["look_alikes"],
                    images=tuple(
                        replace(image, caption=caption) for image, caption in zip(self.images, fields["captions"])
                    ),
                    guidance=tuple(
                        replace(step, task=translated["task"], text=translated["text"])
                        for step, translated in zip(self.guidance, fields["guidance"])
                    ),
                    translation=Translation(language=code, status=status),
                )
        return self


class Catalog:
    def __init__(self, pests: list[Pest], images_dir: Path):
        self.pests = pests
        self.images_dir = images_dir
        self._by_key = {pest.key: pest for pest in pests}

    def get(self, key: str, language: str = "en") -> Pest | None:
        pest = self._by_key.get(key)
        return pest.in_language(language) if pest else None

    def in_language(self, language: str) -> list[Pest]:
        return [pest.in_language(language) for pest in self.pests]

    def __contains__(self, key: str) -> bool:
        return key in self._by_key


def _pest(entry: dict, translation_statuses: dict) -> Pest:
    review = entry["review"]
    translations = tuple(
        (language, entry[language], translation_statuses.get(language, "awaiting_review"))
        for language in LANGUAGES
        if language in entry
    )
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
        guidance=tuple(GuidanceStep(**step) for step in entry.get("guidance", [])),
        _translations=translations,
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
    if not pest.guidance:
        problems.append("no guidance")
    for step in pest.guidance:
        if step.kind not in GUIDANCE_KINDS:
            problems.append(f"unknown guidance kind {step.kind!r}")
        if not 0 < len(step.task) <= TASK_TITLE_MAX:
            problems.append(f"guidance task longer than {TASK_TITLE_MAX} characters")
    for language, fields, _ in pest._translations:
        if len(fields.get("look_for", [])) != len(pest.look_for):
            problems.append(f"{language}: look_for doesn't match")
        if len(fields.get("captions", [])) != len(pest.images):
            problems.append(f"{language}: captions don't match the photos")
        if len(fields.get("guidance", [])) != len(pest.guidance):
            problems.append(f"{language}: guidance doesn't match")
        if any(not 0 < len(step.get("task", "")) <= TASK_TITLE_MAX for step in fields.get("guidance", [])):
            problems.append(f"{language}: guidance task missing or too long")
    return problems


def load_catalog(content_dir: Path = CONTENT_DIR) -> Catalog:
    """Reads and checks the content; a broken entry stops the app from starting."""
    raw = json.loads((content_dir / "catalog.json").read_text(encoding="utf-8"))
    statuses = {language: info["status"] for language, info in raw.get("translations", {}).items()}
    pests = [_pest(entry, statuses) for entry in raw["pests"]]
    images_dir = content_dir / "images"
    problems = [f"{pest.key}: {problem}" for pest in pests for problem in _problems(pest, images_dir)]
    if problems:
        raise ValueError("Pest content is invalid: " + "; ".join(problems))
    return Catalog(pests, images_dir)
