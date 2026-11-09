"""Real image files built in memory for upload tests."""

import io

from PIL import ExifTags, Image


def _encode(image: Image.Image, fmt: str, **save_options) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, fmt, **save_options)
    return buffer.getvalue()


def jpeg(size=(800, 600), color=(90, 140, 80), exif: Image.Exif | None = None) -> bytes:
    options = {"quality": 90}
    if exif is not None:
        options["exif"] = exif.tobytes()
    return _encode(Image.new("RGB", size, color), "JPEG", **options)


def png(size=(800, 600), mode="RGB", color=(90, 140, 80)) -> bytes:
    return _encode(Image.new(mode, size, color), "PNG")


def webp(size=(800, 600)) -> bytes:
    return _encode(Image.new("RGB", size, (90, 140, 80)), "WEBP")


def gif(size=(800, 600)) -> bytes:
    return _encode(Image.new("P", size), "GIF")


def truncated_jpeg() -> bytes:
    """A JPEG whose header is intact but whose pixel data is cut off."""
    data = jpeg(size=(800, 600), color=(10, 200, 30))
    return data[: len(data) // 3]


def phone_exif(orientation: int | None = None, with_gps: bool = True) -> Image.Exif:
    """EXIF like a phone camera writes: an orientation tag and a GPS position."""
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "PhoneCo"
    if orientation is not None:
        exif[ExifTags.Base.Orientation] = orientation
    if with_gps:
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps[ExifTags.GPS.GPSLatitudeRef] = "N"
        gps[ExifTags.GPS.GPSLatitude] = (24.0, 42.0, 30.0)
        gps[ExifTags.GPS.GPSLongitudeRef] = "E"
        gps[ExifTags.GPS.GPSLongitude] = (46.0, 40.0, 10.0)
    return exif


def has_gps(data: bytes) -> bool:
    with Image.open(io.BytesIO(data)) as image:
        return bool(image.getexif().get_ifd(ExifTags.IFD.GPSInfo))
