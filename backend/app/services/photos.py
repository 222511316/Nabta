"""Checking, normalising and storing observation photos (spec §3.5)."""

import io
import logging
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import ApiError

logger = logging.getLogger(__name__)

ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 60_000_000
MIN_SIDE = 256
MAX_EDGE = 2560
THUMB_EDGE = 480
CHUNK_BYTES = 1024 * 1024


@dataclass(frozen=True)
class StoredPhoto:
    filename: str
    thumb_filename: str
    width: int
    height: int


def _photo_error(status_code: int, code: str, message: str) -> ApiError:
    return ApiError(status_code, code, message, fields={"photo": code})


def read_upload(stream: BinaryIO, max_bytes: int) -> bytes:
    """Reads at most max_bytes; anything larger is refused without reading the rest."""
    chunks, total = [], 0
    while chunk := stream.read(CHUNK_BYTES):
        total += len(chunk)
        if total > max_bytes:
            raise _photo_error(413, "image_too_large", "The photo is larger than the upload limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def _decode(data: bytes) -> Image.Image:
    unsupported = _photo_error(400, "unsupported_image_type", "Use a JPEG, PNG or WebP photo.")
    too_large = _photo_error(413, "image_too_large", "The photo has too many pixels.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
    except UnidentifiedImageError:
        raise unsupported from None
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise too_large from None

    if image.format not in ACCEPTED_FORMATS:
        raise unsupported
    width, height = image.size
    if width * height > MAX_PIXELS:
        raise too_large
    if min(width, height) < MIN_SIDE:
        raise _photo_error(400, "image_too_small", "The photo is too small to show an insect clearly.")
    try:
        image.load()
    except (OSError, SyntaxError, ValueError):
        raise _photo_error(400, "invalid_image", "The photo could not be read.") from None
    return image


def _to_rgb(image: Image.Image) -> Image.Image:
    """Flattens transparency onto white; JPEG has no alpha channel."""
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


def store_photo(data: bytes, photos_dir: Path) -> StoredPhoto:
    """Validates and normalises the photo, then writes it and its thumbnail as JPEG.

    Metadata is not copied, which removes the GPS position phones embed.
    """
    image = _to_rgb(ImageOps.exif_transpose(_decode(data)))
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    thumb = image.copy()
    thumb.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.Resampling.LANCZOS)

    stem = uuid.uuid4().hex
    stored = StoredPhoto(f"{stem}.jpg", f"{stem}_thumb.jpg", image.width, image.height)
    photos_dir.mkdir(parents=True, exist_ok=True)
    try:
        image.save(photos_dir / stored.filename, "JPEG", quality=90, optimize=True)
        thumb.save(photos_dir / stored.thumb_filename, "JPEG", quality=80, optimize=True)
    except Exception:
        delete_files(photos_dir, [stored.filename, stored.thumb_filename])
        raise
    return stored


def delete_files(photos_dir: Path, filenames: list[str]) -> None:
    """Best effort: a file that cannot be removed is logged, not raised."""
    for name in filenames:
        try:
            (photos_dir / name).unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not delete photo file %s", name, exc_info=True)
