from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.responses import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_error_handler,
    validation_exception_handler,
)
from app.router import api_router

app = FastAPI(title="Margo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Domain errors raised deliberately in service/permissions code.
app.add_exception_handler(AppError, app_error_handler)

# FastAPI/Starlette HTTP errors (401, 403, 404, 405 …) — wrap in envelope.
app.add_exception_handler(StarletteHTTPException, http_exception_handler)

# Pydantic request validation errors (422) — wrap in envelope.
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# Catch-all for unexpected exceptions.
app.add_exception_handler(Exception, unhandled_error_handler)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
