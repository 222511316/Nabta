"""Reusable field types. Their errors map onto the spec's field-code vocabulary."""

from datetime import UTC, datetime
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BeforeValidator, PlainSerializer, StringConstraints
from pydantic_core import PydanticCustomError


def _utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# Timestamps leave the API as ISO 8601 UTC with a Z suffix, e.g. "2026-09-23T10:15:00Z".
UtcTimestamp = Annotated[datetime, PlainSerializer(_utc_iso, return_type=str)]


def required_text(max_length: int):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]


def _blank_to_none(value):
    if isinstance(value, str):
        return value.strip() or None
    return value


def optional_text(max_length: int):
    """Trimmed; blank becomes None, which is how the API stores "not set"."""
    return Annotated[
        Annotated[str, StringConstraints(max_length=max_length)] | None,
        BeforeValidator(_blank_to_none),
    ]


def _check_email(value: str) -> str:
    try:
        validate_email(value, check_deliverability=False)
    except EmailNotValidError:
        raise PydanticCustomError("invalid_email", "Enter a valid email address.") from None
    return value


EmailAddress = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=254),
    AfterValidator(_check_email),
]

# Sign-in looks the address up rather than validating its shape.
LoginEmail = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=254)]


def _not_blank(value: str) -> str:
    if not value.strip():
        raise PydanticCustomError("required", "This field is required.")
    return value


# Passwords are never trimmed: spaces inside a password are allowed.
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128), AfterValidator(_not_blank)]
AnyPassword = Annotated[str, StringConstraints(min_length=1, max_length=128)]
