"""ApiError and the handlers that give every error response the same shape:

    {"code": "...", "message": "...", "fields": {...}}   # "fields" only when inputs are at fault
"""

import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

# The field-error vocabulary the frontend translates (spec §3.4).
FIELD_CODES = {
    "required",
    "too_short",
    "too_long",
    "invalid_email",
    "invalid",
    "future_date",
    "too_early",
    "unsupported_image_type",
    "invalid_image",
    "image_too_large",
    "image_too_small",
}


class ApiError(Exception):
    """An expected failure, answered as {"code", "message", "fields"?}."""

    def __init__(
        self, status_code: int, code: str, message: str, fields: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields


def validation_error(fields: dict[str, str]) -> ApiError:
    return ApiError(422, "validation_error", "Some fields need attention.", fields)


# Codes for errors raised by the framework itself (unknown route, wrong method, ...).
_HTTP_ERROR_CODES = {
    400: ("bad_request", "The request could not be understood."),
    401: ("not_authenticated", "Please sign in to continue."),
    403: ("forbidden", "You do not have access to this."),
    404: ("not_found", "The requested resource was not found."),
    405: ("method_not_allowed", "This method is not allowed here."),
}


def error_response(
    status_code: int,
    code: str,
    message: str,
    fields: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    content: dict[str, object] = {"code": code, "message": message}
    if fields:
        content["fields"] = fields
    return JSONResponse(content, status_code=status_code, headers=headers)


def _http_error_code(status_code: int) -> tuple[str, str]:
    if status_code in _HTTP_ERROR_CODES:
        return _HTTP_ERROR_CODES[status_code]
    try:
        phrase = HTTPStatus(status_code).phrase
    except ValueError:
        phrase = "Error"
    return phrase.lower().replace(" ", "_").replace("-", "_"), f"{phrase}."


def _field_code(error: dict) -> str:
    """Maps one Pydantic error to the field-code vocabulary."""
    kind = error["type"]
    value = error.get("input")
    if kind in FIELD_CODES:  # raised by our own validators
        return kind
    if kind == "missing" or value is None:
        return "required"
    if isinstance(value, str) and not value.strip():
        return "required"
    if kind == "string_too_short":
        return "too_short"
    if kind == "string_too_long":
        return "too_long"
    return "invalid"


def _field_name(location: tuple) -> str | None:
    # ("body", "email") → "email"; ("body",) or ("body", 0) (malformed JSON) → None
    if len(location) >= 2 and isinstance(location[1], str):
        return location[1]
    return None


async def _handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.fields)


async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields: dict[str, str] = {}
    for error in exc.errors():
        name = _field_name(tuple(error["loc"]))
        if name and name not in fields:
            fields[name] = _field_code(error)
    return error_response(422, "validation_error", "Some fields need attention.", fields or None)


async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code, message = _http_error_code(exc.status_code)
    return error_response(exc.status_code, code, message, headers=exc.headers)


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return error_response(500, "server_error", "Something went wrong on our side. Please try again.")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(Exception, _handle_unexpected)
