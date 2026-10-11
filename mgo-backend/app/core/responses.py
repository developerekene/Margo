import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("margo")


class AppError(Exception):
    """Raise this anywhere in service/permissions code for a clean, envelope-shaped error."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def envelope(data=None, error=None) -> dict:
    """Wrap a response payload in the standard { data, error } shape."""
    return {"data": data, "error": error}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=envelope(
            error={
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        ),
    )


async def http_exception_handler(request: Request, exc) -> JSONResponse:
    """Wrap FastAPI/Starlette HTTPExceptions in the standard envelope.

    Without this, 401/403/404/405 responses bypass our envelope and return a
    bare { "detail": "..." } body that the frontend cannot parse uniformly.
    """
    # exc.detail may be a string or a dict — normalise to a string message.
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", "http_error")
        message = detail.get("message", str(detail))
    else:
        code = _status_code_to_error_code(exc.status_code)
        message = str(detail)

    return JSONResponse(
        status_code=exc.status_code,
        content=envelope(error={"code": code, "message": message, "details": {}}),
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Wrap Pydantic 422 validation errors in the standard envelope."""
    return JSONResponse(
        status_code=422,
        content=envelope(
            error={
                "code": "validation_error",
                "message": "Request validation failed.",
                "details": {"errors": exc.errors()},
            }
        ),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=envelope(
            error={
                "code": "internal_error",
                "message": "Something went wrong.",
                "details": {},
            }
        ),
    )


def _status_code_to_error_code(status_code: int) -> str:
    """Map common HTTP status codes to stable error code strings."""
    _map = {
        400: "bad_request",
        401: "unauthorized",
        403: "permission_denied",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "validation_error",
        429: "too_many_requests",
    }
    return _map.get(status_code, "http_error")
