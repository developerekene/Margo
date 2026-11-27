"""Cloud Tasks enqueue adapter for the knowledge module.

Creates HTTP tasks targeting the internal knowledge worker endpoints.
Caller supplies the payload (a Pydantic model); this module handles
serialisation, authentication, and queue routing.

Design notes
------------
- Task names are deterministic: based on a hash of (queue, payload key).
  Cloud Tasks deduplicates tasks with the same name within a 1-hour window,
  which prevents duplicate page tasks from being enqueued if the crawl
  request is retried. See ``_task_name()`` for the scheme.
- OIDC tokens are attached by Cloud Tasks using the configured service
  account. No credentials appear in the task payload.
- If Cloud Tasks configuration is missing, operations raise AppError 503.
- google-cloud-tasks is imported inside functions to keep startup clean.
"""

import hashlib
import json
import logging

from app.core.config import settings
from app.core.responses import AppError

logger = logging.getLogger("margo")

_INTERNAL_PREFIX = "/api/v1/knowledge/internal"


def _tasks_client():
    """Return a Cloud Tasks client.

    Raises AppError 503 if GCP_PROJECT is not configured.
    """
    if not settings.GCP_PROJECT:
        raise AppError(
            "tasks_not_configured",
            "Task queue is not configured. Contact support.",
            503,
        )
    if not settings.KNOWLEDGE_BASE_URL:
        raise AppError(
            "tasks_not_configured",
            "KNOWLEDGE_BASE_URL is not configured. Contact support.",
            503,
        )
    from google.cloud import tasks_v2

    return tasks_v2.CloudTasksClient()


def _queue_path(client, queue_name: str) -> str:
    return client.queue_path(
        settings.GCP_PROJECT,
        settings.GCP_LOCATION,
        queue_name,
    )


def _task_name(client, queue_name: str, dedup_key: str) -> str:
    """Build a deterministic task name so Cloud Tasks deduplicates retries.

    Format: projects/{proj}/locations/{loc}/queues/{queue}/tasks/{hash}
    Hash is sha256(dedup_key)[:32] (hex).
    """
    key_hash = hashlib.sha256(dedup_key.encode()).hexdigest()[:32]
    queue = _queue_path(client, queue_name)
    return f"{queue}/tasks/{key_hash}"


def _enqueue(queue_name: str, path: str, payload: dict, dedup_key: str) -> bool:
    """Enqueue one HTTP task. Returns True on success or if already-exists.

    Raises AppError 503 on configuration or infrastructure failure.
    """
    from google.api_core.exceptions import AlreadyExists

    client = _tasks_client()

    body = json.dumps(payload).encode("utf-8")
    url = settings.KNOWLEDGE_BASE_URL.rstrip("/") + path

    task = {
        "name": _task_name(client, queue_name, dedup_key),
        "http_request": {
            "http_method": "POST",
            "url": url,
            "headers": {"Content-Type": "application/json"},
            "body": body,
            "oidc_token": {
                "service_account_email": settings.KNOWLEDGE_TASK_SA_EMAIL,
                "audience": settings.KNOWLEDGE_OIDC_AUDIENCE or settings.KNOWLEDGE_BASE_URL,
            },
        },
    }

    try:
        client.create_task(
            request={"parent": _queue_path(client, queue_name), "task": task}
        )
        logger.info("Task enqueued: queue=%s path=%s", queue_name, path)
        return True
    except AlreadyExists:
        # Same task name — idempotent, treat as success.
        logger.info("Task already exists (skipped): queue=%s path=%s", queue_name, path)
        return True
    except Exception as exc:
        logger.error("Task enqueue failed: queue=%s path=%s error=%s", queue_name, path, exc)
        raise AppError(
            "task_enqueue_failed",
            "Failed to queue the processing task. Please try again.",
            503,
        ) from exc


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def enqueue_page_task(tenant_id: str, job_id: str, page_id: str, url: str) -> bool:
    """Enqueue a task to process one crawled page.

    The dedup key is (job_id, page_id), so retrying the crawl request
    for the same job does not produce duplicate tasks.
    """
    payload = {
        "tenant_id": tenant_id,
        "job_id": job_id,
        "page_id": page_id,
        "url": url,
    }
    dedup_key = f"page:{job_id}:{page_id}"
    return _enqueue(
        settings.CLOUD_TASKS_CRAWL_QUEUE,
        f"{_INTERNAL_PREFIX}/process-page",
        payload,
        dedup_key,
    )


def enqueue_document_task(
    tenant_id: str, document_id: str, storage_object: str
) -> bool:
    """Enqueue a task to process one uploaded document.

    The dedup key is document_id, so a repeated upload request for the same
    document does not create duplicate tasks.
    """
    payload = {
        "tenant_id": tenant_id,
        "document_id": document_id,
        "storage_object": storage_object,
    }
    dedup_key = f"document:{document_id}"
    return _enqueue(
        settings.CLOUD_TASKS_DOC_QUEUE,
        f"{_INTERNAL_PREFIX}/process-document",
        payload,
        dedup_key,
    )
