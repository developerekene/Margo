from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Raise this anywhere in service/permissions code for a clean, envelope-shaped error."""
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def envelope(data=None, error=None):
    return {"data": data, "error": error}


async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content=envelope(error={"code": exc.code, "message": exc.message, "details": exc.details}),
    )


async def unhandled_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=envelope(error={"code": "internal_error", "message": "Something went wrong.", "details": {}}),
    )