"""Knowledge module service layer.

Orchestrates the ingestion lifecycle:
  - Crawl job creation, page discovery, and task dispatch.
  - Document upload, storage, and task dispatch.
  - Status queries and document listing.
  - Document deletion.
  - Internal task handlers (page extraction, document extraction).

This module has no FastAPI imports and no HTTP concerns. All external I/O
(Firestore, GCS, Cloud Tasks, HTTP fetching) is delegated to the adapters in
this module's package.

Billing enforcement
-------------------
- Crawl: is_subscription_active → reserve_usage("crawl_pages", pages_count)
- Documents: is_subscription_active → is_within_plan_limit("documents")
Both use the billing public ports API; no billing internals are imported.
"""

import logging
import re
import secrets
from datetime import UTC, datetime

from google.cloud.firestore_v1 import Increment

from app.core.config import settings
from app.core.responses import AppError
from app.modules.billing import ports as billing_ports
from app.modules.knowledge import storage as gcs
from app.modules.knowledge import tasks as cloud_tasks
from app.modules.knowledge.constants import (
    CRAWL_JOBS_SUBCOLLECTION,
    DOCUMENTS_SUBCOLLECTION,
    GCS_OBJECT_TEMPLATE,
    PAGES_SUBCOLLECTION,
    TENANTS_COLLECTION,
)
from app.modules.knowledge.crawler import discover_pages
from app.modules.knowledge.extractor import extract_html, extract_markdown, extract_pdf
from app.modules.knowledge.schemas import (
    CrawlJobResponse,
    CrawlJobStatus,
    DocumentListItem,
    DocumentListResponse,
    DocumentStatus,
    DocumentUploadResponse,
    PageStatus,
    SourceType,
)
from app.modules.knowledge.url_validation import (
    assert_domain_allowed,
    get_tenant_allowed_domains,
    validate_crawl_url,
)
from app.shared.container import get_db
from app.shared.event_bus import publish

logger = logging.getLogger("margo")

_DEFAULT_PAGE_LIMIT = 20
_MAX_PAGE_LIMIT = 100
_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._\-]")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _generate_id(prefix: str = "") -> str:
    return f"{prefix}{secrets.token_hex(8)}"


def _tenant_ref(db, tenant_id: str):
    return db.collection(TENANTS_COLLECTION).document(tenant_id)


def _documents_ref(db, tenant_id: str):
    return _tenant_ref(db, tenant_id).collection(DOCUMENTS_SUBCOLLECTION)


def _crawl_jobs_ref(db, tenant_id: str):
    return _tenant_ref(db, tenant_id).collection(CRAWL_JOBS_SUBCOLLECTION)


def _pages_ref(db, tenant_id: str, job_id: str):
    return _crawl_jobs_ref(db, tenant_id).document(job_id).collection(PAGES_SUBCOLLECTION)


def _sanitise_filename(raw: str) -> str:
    """Remove unsafe characters from a display filename."""
    name = _SAFE_FILENAME_RE.sub("_", raw)
    return name[:200] or "document"


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Crawl — POST /knowledge/{tenant_id}/crawl
# ---------------------------------------------------------------------------


def create_crawl_job(tenant_id: str, url: str) -> CrawlJobResponse:
    """Validate, discover pages, dispatch tasks, and return the crawl job.

    Billing checks:
      1. is_subscription_active — 403 if the subscription is lapsed.
      2. reserve_usage("crawl_pages", pages_count) — 403 if quota exhausted.
         This is atomic: two concurrent requests cannot both take the last units.

    Partial enqueue failure (Decision 6): pages that fail to enqueue are
    marked 'failed' immediately. The job is returned with partial results.
    """
    db = get_db()

    # 1. Subscription gate.
    if not billing_ports.is_subscription_active(tenant_id):
        raise AppError(
            "subscription_required",
            "An active subscription is required to crawl pages.",
            403,
        )

    # 2. URL validation (syntax + scheme + no-credential + no-private-IP).
    clean_url = validate_crawl_url(url)

    # 3. Allowed-domain check.
    allowed_domains = get_tenant_allowed_domains(db, tenant_id)
    assert_domain_allowed(clean_url, allowed_domains)

    # 4. Discover pages (bounded, synchronous).
    pages = discover_pages(clean_url)
    page_count = len(pages)

    if page_count == 0:
        raise AppError(
            "no_pages_discovered",
            "No crawlable pages were found at the provided URL.",
            400,
        )

    # 5. Reserve crawl-page quota atomically.
    if not billing_ports.reserve_usage(tenant_id, "crawl_pages", page_count):
        raise AppError(
            "crawl_pages_limit_reached",
            f"Your plan's crawl-page quota does not have room for {page_count} more pages this month.",
            403,
        )

    # 6. Create the crawl job record.
    job_id = _generate_id("job_")
    now = _now()
    job_data = {
        "job_id": job_id,
        "tenant_id": tenant_id,
        "start_url": clean_url,
        "status": CrawlJobStatus.PROCESSING.value,
        "pages_discovered": page_count,
        "pages_completed": 0,
        "pages_failed": 0,
        "created_at": now,
        "updated_at": now,
        "error_message": None,
    }
    _crawl_jobs_ref(db, tenant_id).document(job_id).set(job_data)

    # 7. Create page records and enqueue tasks (best-effort per page).
    pages_failed = 0
    for page in pages:
        page_now = _now()
        page_data = {
            "page_id": page.page_id,
            "url": page.url,
            "status": PageStatus.QUEUED.value,
            "failure_stage": None,
            "error_message": None,
            "created_at": page_now,
            "updated_at": page_now,
            "title": None,
        }
        _pages_ref(db, tenant_id, job_id).document(page.page_id).set(page_data)

        try:
            cloud_tasks.enqueue_page_task(tenant_id, job_id, page.page_id, page.url)
        except AppError:
            # Enqueue failed — mark the page failed immediately.
            pages_failed += 1
            _pages_ref(db, tenant_id, job_id).document(page.page_id).update({
                "status": PageStatus.FAILED.value,
                "failure_stage": "enqueue",
                "error_message": "Task could not be queued.",
                "updated_at": _now(),
            })

    # Update the job if some enqueues failed.
    if pages_failed > 0:
        _crawl_jobs_ref(db, tenant_id).document(job_id).update({
            "pages_failed": pages_failed,
            "updated_at": _now(),
        })

    logger.info(
        "Crawl job created: tenant=%s job=%s pages=%d failed_enqueue=%d",
        tenant_id, job_id, page_count, pages_failed,
    )

    return CrawlJobResponse(
        job_id=job_id,
        tenant_id=tenant_id,
        start_url=clean_url,
        status=CrawlJobStatus.PROCESSING,
        pages_discovered=page_count,
        pages_completed=0,
        pages_failed=pages_failed,
        created_at=now,
        updated_at=now,
    )


def get_crawl_job(tenant_id: str, job_id: str) -> CrawlJobResponse:
    """Return the current status of a crawl job."""
    db = get_db()
    doc = _crawl_jobs_ref(db, tenant_id).document(job_id).get()
    if not doc.exists:
        raise AppError("crawl_job_not_found", "Crawl job not found.", 404)

    data = doc.to_dict()
    if data.get("tenant_id") != tenant_id:
        raise AppError("crawl_job_not_found", "Crawl job not found.", 404)

    return CrawlJobResponse(
        job_id=data["job_id"],
        tenant_id=data["tenant_id"],
        start_url=data["start_url"],
        status=CrawlJobStatus(data["status"]),
        pages_discovered=data.get("pages_discovered", 0),
        pages_completed=data.get("pages_completed", 0),
        pages_failed=data.get("pages_failed", 0),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        error_message=data.get("error_message"),
    )


# ---------------------------------------------------------------------------
# Document upload — POST /knowledge/{tenant_id}/documents
# ---------------------------------------------------------------------------


def upload_document(
    tenant_id: str,
    filename: str,
    source_type: SourceType,
    file_bytes: bytes,
) -> DocumentUploadResponse:
    """Validate, store, record, and dispatch a document upload task.

    Billing checks:
      1. is_subscription_active — 403 if lapsed.
      2. is_within_plan_limit("documents") — 403 if at the document limit.
         (Preliminary check only; billing counts the live collection size.)

    Failure handling: if GCS upload succeeds but Firestore write or task
    enqueue fails, we attempt to roll back the GCS object and return 503.
    """
    db = get_db()

    # 1. Subscription gate.
    if not billing_ports.is_subscription_active(tenant_id):
        raise AppError(
            "subscription_required",
            "An active subscription is required to upload documents.",
            403,
        )

    # 2. Document-count limit.
    if not billing_ports.is_within_plan_limit(tenant_id, "documents"):
        raise AppError(
            "document_limit_reached",
            "Your plan's document limit has been reached. Delete existing documents or upgrade.",
            403,
        )

    document_id = _generate_id("doc_")
    safe_filename = _sanitise_filename(filename)
    now = _now()
    object_path = GCS_OBJECT_TEMPLATE.format(
        tenant_id=tenant_id, document_id=document_id
    )
    content_type = "application/pdf" if source_type == SourceType.PDF else "text/markdown"

    # 3. Upload to GCS.
    gcs.upload_file(object_path, file_bytes, content_type)

    # 4. Create Firestore record.
    doc_data = {
        "document_id": document_id,
        "tenant_id": tenant_id,
        "filename": safe_filename,
        "source_type": source_type.value,
        "storage_object": object_path,
        "status": DocumentStatus.QUEUED.value,
        "failure_stage": None,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
        "extracted_at": None,
        "title": None,
    }
    try:
        _documents_ref(db, tenant_id).document(document_id).set(doc_data)
    except Exception as exc:
        logger.error(
            "Firestore write failed after GCS upload: tenant=%s doc=%s — attempting GCS cleanup",
            tenant_id, document_id,
        )
        try:
            gcs.delete_file(object_path)
        except Exception:
            logger.error("GCS cleanup also failed: object=%s", object_path)
        raise AppError(
            "document_record_failed",
            "Failed to record the document. The upload was rolled back.",
            503,
        ) from exc

    # 5. Enqueue processing task.
    try:
        cloud_tasks.enqueue_document_task(tenant_id, document_id, object_path)
    except AppError:
        logger.error(
            "Task enqueue failed: tenant=%s doc=%s — attempting cleanup",
            tenant_id, document_id,
        )
        try:
            _documents_ref(db, tenant_id).document(document_id).delete()
            gcs.delete_file(object_path)
        except Exception:
            logger.error("Cleanup after enqueue failure also failed: doc=%s", document_id)
        raise AppError(
            "task_enqueue_failed",
            "Failed to queue the processing task. The upload was rolled back.",
            503,
        )

    logger.info(
        "Document uploaded: tenant=%s doc=%s file=%s", tenant_id, document_id, safe_filename
    )

    return DocumentUploadResponse(
        document_id=document_id,
        tenant_id=tenant_id,
        filename=safe_filename,
        source_type=source_type,
        status=DocumentStatus.QUEUED,
        created_at=now,
    )


# ---------------------------------------------------------------------------
# Document listing — GET /knowledge/{tenant_id}/documents
# ---------------------------------------------------------------------------


def list_documents(
    tenant_id: str,
    limit: int | None = None,
    cursor: str | None = None,
) -> DocumentListResponse:
    """Return a paginated list of documents for a tenant."""
    db = get_db()
    page_limit = min(max(1, limit or _DEFAULT_PAGE_LIMIT), _MAX_PAGE_LIMIT)

    query = (
        _documents_ref(db, tenant_id)
        .order_by("created_at", direction="DESCENDING")
        .limit(page_limit + 1)
    )
    if cursor:
        # cursor is the document_id of the last item on the previous page.
        last_doc = _documents_ref(db, tenant_id).document(cursor).get()
        if last_doc.exists:
            query = query.start_after(last_doc)

    docs = query.get()
    has_more = len(docs) > page_limit
    page = docs[:page_limit]

    items = [
        DocumentListItem(
            document_id=d.to_dict()["document_id"],
            tenant_id=d.to_dict()["tenant_id"],
            filename=d.to_dict()["filename"],
            source_type=SourceType(d.to_dict()["source_type"]),
            status=DocumentStatus(d.to_dict()["status"]),
            title=d.to_dict().get("title"),
            error_message=d.to_dict().get("error_message"),
            created_at=d.to_dict()["created_at"],
            updated_at=d.to_dict()["updated_at"],
        )
        for d in page
    ]

    next_cursor = page[-1].id if has_more and page else None
    return DocumentListResponse(documents=items, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# Document deletion — DELETE /knowledge/{tenant_id}/documents/{document_id}
# ---------------------------------------------------------------------------


def delete_document(tenant_id: str, document_id: str) -> None:
    """Delete a document, its GCS object, and publish DocumentDeleted.

    Per Decision 2: chunk deletion is handled asynchronously by the
    embedding module when it subscribes to the DocumentDeleted event.
    We do NOT claim chunks are immediately removed.
    """
    db = get_db()
    doc_ref = _documents_ref(db, tenant_id).document(document_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise AppError("document_not_found", "Document not found.", 404)

    data = doc.to_dict()
    if data.get("tenant_id") != tenant_id:
        raise AppError("document_not_found", "Document not found.", 404)

    object_path = data.get("storage_object")

    # Delete from GCS (best-effort — idempotent).
    if object_path:
        try:
            gcs.delete_file(object_path)
        except AppError as exc:
            logger.error(
                "GCS delete failed during document deletion: doc=%s object=%s",
                document_id, object_path,
            )
            # We continue and delete the Firestore record regardless,
            # since the GCS delete is idempotent and can be retried.

    # Delete the Firestore record.
    doc_ref.delete()

    # Notify embedding module (Decision 2 — async chunk cleanup).
    publish(
        "DocumentDeleted",
        tenant_id=tenant_id,
        document_id=document_id,
    )

    logger.info("Document deleted: tenant=%s doc=%s", tenant_id, document_id)


# ---------------------------------------------------------------------------
# Internal: process-page worker
# ---------------------------------------------------------------------------


def process_page(tenant_id: str, job_id: str, page_id: str, url: str) -> None:
    """Extract and clean content from one crawled page.

    Called by the internal /process-page endpoint after OIDC auth.
    Idempotent: if the page is already completed or failed, returns immediately.
    """
    db = get_db()
    page_ref = _pages_ref(db, tenant_id, job_id).document(page_id)
    page_doc = page_ref.get()

    if not page_doc.exists:
        logger.warning(
            "process_page: page record not found tenant=%s job=%s page=%s",
            tenant_id, job_id, page_id,
        )
        return  # Permanent failure — don't retry (return 200 to Cloud Tasks).

    data = page_doc.to_dict()

    # Idempotency: skip if already in a terminal state.
    if data["status"] in (PageStatus.COMPLETED.value, PageStatus.FAILED.value):
        logger.info(
            "process_page: already terminal, skipping tenant=%s page=%s status=%s",
            tenant_id, page_id, data["status"],
        )
        return

    # Transition to 'extracting'.
    page_ref.update({"status": PageStatus.EXTRACTING.value, "updated_at": _now()})

    # Fetch the page.
    try:
        import httpx as _httpx
        response = _httpx.get(
            url,
            timeout=settings.KNOWLEDGE_CRAWL_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={"User-Agent": "MargoBot/1.0 (+https://margo.ai/bot)"},
        )
        response.raise_for_status()
    except Exception as exc:
        _fail_page(page_ref, "fetch", f"Page fetch failed: {exc}")
        _increment_job_failed(db, tenant_id, job_id)
        return

    # Extract text.
    try:
        title, content = extract_html(response.content, url)
    except ValueError as exc:
        _fail_page(page_ref, "extraction", str(exc))
        _increment_job_failed(db, tenant_id, job_id)
        return

    # Mark completed and publish event.
    page_ref.update({
        "status": PageStatus.COMPLETED.value,
        "title": title,
        "updated_at": _now(),
    })
    _increment_job_completed(db, tenant_id, job_id)

    publish(
        "PageExtracted",
        tenant_id=tenant_id,
        url=url,
        title=title,
        content=content,
    )
    logger.info("Page extracted: tenant=%s job=%s page=%s", tenant_id, job_id, page_id)


def _fail_page(page_ref, stage: str, message: str) -> None:
    page_ref.update({
        "status": PageStatus.FAILED.value,
        "failure_stage": stage,
        "error_message": message[:500],
        "updated_at": _now(),
    })


def _increment_job_failed(db, tenant_id: str, job_id: str) -> None:
    try:
        _crawl_jobs_ref(db, tenant_id).document(job_id).update({
            "pages_failed": Increment(1),
            "updated_at": _now(),
        })
    except Exception:
        logger.exception("Failed to increment pages_failed: job=%s", job_id)


def _increment_job_completed(db, tenant_id: str, job_id: str) -> None:
    try:
        _crawl_jobs_ref(db, tenant_id).document(job_id).update({
            "pages_completed": Increment(1),
            "updated_at": _now(),
        })
    except Exception:
        logger.exception("Failed to increment pages_completed: job=%s", job_id)


# ---------------------------------------------------------------------------
# Internal: process-document worker
# ---------------------------------------------------------------------------


def process_document(
    tenant_id: str, document_id: str, storage_object: str
) -> None:
    """Extract text from one uploaded document.

    Called by the internal /process-document endpoint after OIDC auth.
    Idempotent: if the document is already in a terminal or later state,
    returns immediately.
    """
    db = get_db()
    doc_ref = _documents_ref(db, tenant_id).document(document_id)
    doc = doc_ref.get()

    if not doc.exists:
        logger.warning(
            "process_document: record not found tenant=%s doc=%s",
            tenant_id, document_id,
        )
        return

    data = doc.to_dict()

    # Verify the payload matches the stored record (prevents spoofed payloads).
    if data.get("tenant_id") != tenant_id:
        logger.warning(
            "process_document: tenant mismatch payload=%s stored=%s",
            tenant_id, data.get("tenant_id"),
        )
        return

    # Idempotency: skip if already past extraction.
    if data["status"] not in (DocumentStatus.QUEUED.value, DocumentStatus.EXTRACTING.value):
        logger.info(
            "process_document: already past extraction state=%s doc=%s",
            data["status"], document_id,
        )
        return

    # Transition to 'extracting'.
    doc_ref.update({"status": DocumentStatus.EXTRACTING.value, "updated_at": _now()})

    # Download from GCS.
    try:
        file_bytes = gcs.download_file(storage_object)
    except AppError as exc:
        _fail_document(doc_ref, "storage_download", exc.message)
        return

    # Extract based on source type.
    source_type_str = data.get("source_type", "")
    try:
        if source_type_str == SourceType.PDF.value:
            title, content = extract_pdf(file_bytes)
        elif source_type_str == SourceType.MARKDOWN.value:
            title, content = extract_markdown(file_bytes)
        else:
            _fail_document(doc_ref, "extraction", f"Unknown source_type: {source_type_str}")
            return
    except ValueError as exc:
        _fail_document(doc_ref, "extraction", str(exc))
        return

    # Transition to 'embedding' (Decision 1: completed = embedding done in future).
    now = _now()
    doc_ref.update({
        "status": DocumentStatus.EMBEDDING.value,
        "title": title or data.get("filename"),
        "extracted_at": now,
        "updated_at": now,
        "error_message": None,
        "failure_stage": None,
    })

    publish(
        "DocumentExtracted",
        tenant_id=tenant_id,
        document_id=document_id,
        source_type=source_type_str,
        title=title or data.get("filename", ""),
        content=content,
    )
    logger.info("Document extracted: tenant=%s doc=%s", tenant_id, document_id)


def _fail_document(doc_ref, stage: str, message: str) -> None:
    doc_ref.update({
        "status": DocumentStatus.FAILED.value,
        "failure_stage": stage,
        "error_message": message[:500],
        "updated_at": _now(),
    })
