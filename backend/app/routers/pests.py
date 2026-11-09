"""US11, US17: reference content and guidance for each pest category, in the browser's language. Any signed-in user."""

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.deps import CurrentUser, Language, PestCatalog
from app.pests import Catalog, Pest
from app.schemas.pests import (
    ContentReviewOut,
    GuidanceStepOut,
    PestOut,
    PestSummaryOut,
    ReferenceImageOut,
    SourceOut,
    TranslationOut,
)
from app.services.plants import not_found

router = APIRouter(prefix="/api/pests", tags=["pests"])


def _image_url(pest: Pest, filename: str) -> str:
    return f"/api/pests/{pest.key}/images/{filename}"


def _find(catalog: Catalog, key: str, language: str = "en") -> Pest:
    pest = catalog.get(key, language)
    if pest is None:
        raise not_found()
    return pest


@router.get("", response_model=list[PestSummaryOut])
def list_pests(user: CurrentUser, catalog: PestCatalog, language: Language) -> list[PestSummaryOut]:
    return [
        PestSummaryOut(
            key=pest.key,
            name=pest.name,
            summary=pest.summary,
            image_url=_image_url(pest, pest.images[0].file),
            review_status=pest.review.status,
        )
        for pest in catalog.in_language(language)
    ]


@router.get("/{key}", response_model=PestOut)
def get_pest(key: str, user: CurrentUser, catalog: PestCatalog, language: Language) -> PestOut:
    pest = _find(catalog, key, language)
    return PestOut(
        key=pest.key,
        name=pest.name,
        summary=pest.summary,
        look_for=list(pest.look_for),
        size=pest.size,
        where=pest.where,
        damage=pest.damage,
        look_alikes=pest.look_alikes,
        sources=[SourceOut(title=s.title, publisher=s.publisher, url=s.url) for s in pest.sources],
        review=ContentReviewOut(
            status=pest.review.status, reviewed_by=pest.review.reviewed_by, reviewed_on=pest.review.reviewed_on
        ),
        images=[
            ReferenceImageOut(url=_image_url(pest, image.file), caption=image.caption, credit=image.credit)
            for image in pest.images
        ],
        guidance=[GuidanceStepOut(kind=step.kind, task=step.task, text=step.text) for step in pest.guidance],
        translation=(
            TranslationOut(language=pest.translation.language, status=pest.translation.status)
            if pest.translation
            else None
        ),
    )


@router.get("/{key}/images/{filename}", response_class=FileResponse)
def pest_image(key: str, filename: str, user: CurrentUser, catalog: PestCatalog) -> FileResponse:
    image = _find(catalog, key).image(filename)
    if image is None:
        raise not_found()
    return FileResponse(
        catalog.images_dir / image.file, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"}
    )
