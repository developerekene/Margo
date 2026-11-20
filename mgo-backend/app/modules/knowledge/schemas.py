"""Knowledge module data shapes.

Covers:
  - Domain enumerations (processing status, crawl status, source type).
  - Public API request and response models.
  - Internal Cloud Tasks payload models.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class SourceType(str, Enum):
    """Supported document types."""

    PDF = "pdf"
    MARKDOWN = "markdown"


class DocumentStatus(str, Enum):
    """Lifecycle stages for an uploaded document.

    queued -> extracting -> embedding -> completed
                                      -> failed (at any stage)

    Per the approved design (Decision 1): knowledge marks a record as
    'embedding' after successful extraction. Transition to 'completed'
    will happen via a future EmbeddingCompleted event from the embedding module.
    """

    QUEUED = "queued"
    EXTRACTING = "extracting"
    EMBEDDING = "embedding"    # extraction done; embedding in progress
    COMPLETED = "completed"    # embedding confirmed (future event)
    FAILED = "failed"


class CrawlJobStatus(str, Enum):
    """Lifecycle stages for a crawl job."""

    PENDING = "pending"           # created, task dispatch not yet started
    PROCESSING = "processing"     # tasks dispatched, pages in flight
    COMPLETED = "completed"       # all pages finished
    FAILED = "failed"             # discovery failed before any tasks dispatched


class PageStatus(str, Enum):
    """Per-page status within a crawl job."""

    QUEUED = "queued"
    EXTRACTING = "extracting"
    COMPLETED = "completed"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# Public API — Crawl
# ---------------------------------------------------------------------------


class CrawlRequest(BaseModel):
    """Body for POST /knowledge/{tenant_id}/crawl."""

    url: str = Field(
        ...,
        description="Starting URL to crawl. Must be in the tenant's widget allowed-domain list.",
    )


class CrawlJobResponse(BaseModel):
    """Response for both the crawl trigger and the status poll."""

    job_id: str
    tenant_id: str
    start_url: str
    status: CrawlJobStatus
    pages_discovered: int = 0
    pages_completed: int = 0
    pages_failed: int = 0
    created_at: datetime
    updated_at: datetime
    error_message: str | None = None


# ---------------------------------------------------------------------------
# Public API — Documents
# ---------------------------------------------------------------------------


class DocumentUploadResponse(BaseModel):
    """Response for POST /knowledge/{tenant_id}/documents."""

    document_id: str
    tenant_id: str
    filename: str
    source_type: SourceType
    status: DocumentStatus
    created_at: datetime


class DocumentListItem(BaseModel):
    """Single document record in the listing response."""

    document_id: str
    tenant_id: str
    filename: str
    source_type: SourceType
    status: DocumentStatus
    title: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    """Paginated response for GET /knowledge/{tenant_id}/documents."""

    documents: list[DocumentListItem]
    next_cursor: str | None = None


# ---------------------------------------------------------------------------
# Internal Cloud Tasks payloads
# ---------------------------------------------------------------------------


class ProcessPagePayload(BaseModel):
    """Payload sent with each crawl-page Cloud Task.

    Authentication is provided by the OIDC token on the request, not by
    these fields. The handler cross-checks these IDs against Firestore records.
    """

    tenant_id: str
    job_id: str
    page_id: str
    url: str


class ProcessDocumentPayload(BaseModel):
    """Payload sent with the document-processing Cloud Task."""

    tenant_id: str
    document_id: str
    # GCS object path, e.g. tenants/{tenant_id}/documents/{doc_id}/original
    storage_object: str
