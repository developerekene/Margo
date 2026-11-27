"""Cloud Storage adapter for the knowledge module.

Provides upload, download, and delete operations against Google Cloud Storage.

Design notes
------------
- All operations use a single configurable bucket (GCS_BUCKET setting).
- Object paths are always server-generated (from document_id), never derived
  from user-supplied filenames, so path traversal is not possible.
- File contents are never logged.
- If GCS_BUCKET is not configured, operations raise AppError 503 immediately
  rather than producing a confusing client/credentials error.
- The google-cloud-storage client is imported inside functions so the module
  loads cleanly in test environments where only the billing/identity tests run.
"""

import logging

from app.core.config import settings
from app.core.responses import AppError

logger = logging.getLogger("margo")


def _get_bucket():
    """Return the configured GCS bucket object.

    Raises AppError 503 if GCS_BUCKET is not configured.
    """
    if not settings.GCS_BUCKET:
        raise AppError(
            "storage_not_configured",
            "Document storage is not configured. Contact support.",
            503,
        )
    # Import here: avoids google-cloud-storage being a hard startup dependency
    # in environments that only run identity/billing tests.
    from google.cloud import storage as gcs

    client = gcs.Client()
    return client.bucket(settings.GCS_BUCKET)


def upload_file(object_path: str, data: bytes, content_type: str) -> None:
    """Upload raw bytes to GCS at ``object_path``.

    Args:
        object_path: GCS object name, e.g. "tenants/t-1/documents/doc_1/original".
        data: Raw file bytes.
        content_type: MIME type, e.g. "application/pdf".

    Raises:
        AppError 503 if the bucket is not configured or the upload fails.
    """
    bucket = _get_bucket()
    blob = bucket.blob(object_path)
    try:
        blob.upload_from_string(data, content_type=content_type)
        logger.info("GCS upload: object=%s size=%d", object_path, len(data))
    except Exception as exc:
        logger.error("GCS upload failed: object=%s error=%s", object_path, exc)
        raise AppError(
            "storage_upload_failed",
            "Failed to store the uploaded file. Please try again.",
            503,
        ) from exc


def download_file(object_path: str) -> bytes:
    """Download and return the raw bytes of a GCS object.

    Raises:
        AppError 404 if the object does not exist.
        AppError 503 if the bucket is not configured or download fails.
    """
    from google.cloud.exceptions import NotFound

    bucket = _get_bucket()
    blob = bucket.blob(object_path)
    try:
        data = blob.download_as_bytes()
        logger.info("GCS download: object=%s size=%d", object_path, len(data))
        return data
    except NotFound:
        logger.warning("GCS object not found: object=%s", object_path)
        raise AppError(
            "storage_object_not_found",
            "The file could not be retrieved. It may have been deleted.",
            404,
        )
    except Exception as exc:
        logger.error("GCS download failed: object=%s error=%s", object_path, exc)
        raise AppError(
            "storage_download_failed",
            "Failed to retrieve the file. Please try again.",
            503,
        ) from exc


def delete_file(object_path: str) -> None:
    """Delete a GCS object.

    Silently succeeds if the object does not exist (idempotent).
    Raises AppError 503 on unexpected failures.
    """
    from google.cloud.exceptions import NotFound

    bucket = _get_bucket()
    blob = bucket.blob(object_path)
    try:
        blob.delete()
        logger.info("GCS delete: object=%s", object_path)
    except NotFound:
        # Already gone — idempotent, not an error.
        logger.info("GCS delete: object already absent: object=%s", object_path)
    except Exception as exc:
        logger.error("GCS delete failed: object=%s error=%s", object_path, exc)
        raise AppError(
            "storage_delete_failed",
            "Failed to delete the stored file. Please try again.",
            503,
        ) from exc
