"""Knowledge module API — route definitions.

Route order matters: static paths (/internal/...) must be declared BEFORE
the parameterised paths (/{tenant_id}/...) so FastAPI does not try to match
"internal" as a tenant_id.

All public endpoints: authenticated via require_tenant_access, owner/admin.
Internal endpoints: authenticated via require_cloud_tasks_token (OIDC only).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, UploadFile
from fastapi.responses import JSONResponse

from app.core.responses import AppError, envelope
from app.modules.knowledge import service
from app.modules.knowledge.permissions import require_cloud_tasks_token
from app.modules.knowledge.schemas import (
    CrawlRequest,
    ProcessDocumentPayload,
    ProcessPagePayload,
    SourceType,
)
from app.shared.auth import require_tenant_access

logger = logging.getLogger("margo")

router = APIRouter()

# Roles permitted to manage knowledge resources.
_KNOWLEDGE_ROLES = ["company_owner", "company_admin"]

# Max upload size in bytes (enforced before reading file contents).
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB default; config overrides possible

# ---------------------------------------------------------------------------
# IMPORTANT: internal routes declared FIRST
# FastAPI matches routes in declaration order. If /{tenant_id}/... were first,
# "internal" would be captured as a tenant_id.
# ---------------------------------------------------------------------------


@router.post("/internal/process-page", response_model=dict)
def internal_process_page(
    payload: ProcessPagePayload,
    _claims: dict = Depends(require_cloud_tasks_token),
):
    """Cloud Tasks callback: extract content from one crawled page.

    Returns 200 for both success and permanent failure (so Cloud Tasks does
    not retry). Returns 5xx only for transient infrastructure errors.
    """
    service.process_page(
        tenant_id=payload.tenant_id,
        job_id=payload.job_id,
        page_id=payload.page_id,
        url=payload.url,
    )
    return envelope(data={"status": "ok"})


@router.post("/internal/process-document", response_model=dict)
def internal_process_document(
    payload: ProcessDocumentPayload,
    _claims: dict = Depends(require_cloud_tasks_token),
):
    """Cloud Tasks callback: extract content from one uploaded document.

    Returns 200 for both success and permanent failure. Returns 5xx only
    for transient infrastructure errors.
    """
    service.process_document(
        tenant_id=payload.tenant_id,
        document_id=payload.document_id,
        storage_object=payload.storage_object,
    )
    return envelope(data={"status": "ok"})


# ---------------------------------------------------------------------------
# Public tenant-scoped endpoints
# ---------------------------------------------------------------------------


@router.post("/{tenant_id}/crawl", response_model=dict)
def trigger_crawl(
    tenant_id: str,
    body: CrawlRequest,
    user: dict = Depends(require_tenant_access(roles=_KNOWLEDGE_ROLES)),
):
    """Crawl a website and enqueue one processing task per discovered page.

    The request URL must be in the tenant's widget allowed-domain list.
    Discovery is bounded by the tenant's remaining crawl-page quota and the
    configured KNOWLEDGE_MAX_CRAWL_PAGES limit.
    """
    result = service.create_crawl_job(tenant_id=tenant_id, url=body.url)
    return envelope(data=result.model_dump())


@router.get("/{tenant_id}/crawl/{job_id}", response_model=dict)
def get_crawl_status(
    tenant_id: str,
    job_id: str,
    user: dict = Depends(require_tenant_access(roles=_KNOWLEDGE_ROLES)),
):
    """Return the current status of a crawl job."""
    result = service.get_crawl_job(tenant_id=tenant_id, job_id=job_id)
    return envelope(data=result.model_dump())


@router.post("/{tenant_id}/documents", response_model=dict)
def upload_document(
    tenant_id: str,
    file: UploadFile,
    user: dict = Depends(require_tenant_access(roles=_KNOWLEDGE_ROLES)),
):
    """Upload a PDF or Markdown document for processing.

    Accepts multipart/form-data with a single ``file`` field.
    The file is validated, stored in Cloud Storage, and queued for extraction.
    Returns immediately with status ``queued`` — extraction is asynchronous.
    """
    filename = file.filename or "document"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if extension == "pdf":
        source_type = SourceType.PDF
    elif extension in ("md", "markdown"):
        source_type = SourceType.MARKDOWN
    else:
        raise AppError(
            "unsupported_file_type",
            "Only PDF (.pdf) and Markdown (.md, .markdown) files are supported.",
            400,
        )

    # Read and validate size.
    file_bytes = file.file.read(_MAX_UPLOAD_BYTES + 1)
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise AppError(
            "file_too_large",
            f"Maximum upload size is {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            413,
        )
    if len(file_bytes) == 0:
        raise AppError("empty_file", "The uploaded file is empty.", 400)

    # Validate file magic bytes.
    if source_type == SourceType.PDF and not file_bytes.startswith(b"%PDF-"):
        raise AppError(
            "invalid_file",
            "The uploaded file does not appear to be a valid PDF.",
            400,
        )
    if source_type == SourceType.MARKDOWN:
        try:
            file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise AppError(
                "invalid_file",
                "Markdown files must be encoded in UTF-8.",
                400,
            )

    result = service.upload_document(
        tenant_id=tenant_id,
        filename=filename,
        source_type=source_type,
        file_bytes=file_bytes,
    )
    return envelope(data=result.model_dump())


@router.get("/{tenant_id}/documents", response_model=dict)
def list_documents(
    tenant_id: str,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
    cursor: str | None = None,
    user: dict = Depends(require_tenant_access(roles=_KNOWLEDGE_ROLES)),
):
    """List documents for a tenant with their processing status."""
    result = service.list_documents(tenant_id=tenant_id, limit=limit, cursor=cursor)
    return envelope(data=result.model_dump())


@router.delete("/{tenant_id}/documents/{document_id}", response_model=dict)
def delete_document(
    tenant_id: str,
    document_id: str,
    user: dict = Depends(require_tenant_access(roles=_KNOWLEDGE_ROLES)),
):
    """Delete a document and its associated storage object.

    Note: embedding chunks associated with this document will be cleaned up
    asynchronously when the embedding module handles the DocumentDeleted event.
    """
    service.delete_document(tenant_id=tenant_id, document_id=document_id)
    return envelope(data={"status": "deleted"})
