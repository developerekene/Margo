"""WI-9: Cloud Tasks idempotency and payload validation.

Verifies:
- process_page: duplicate delivery is a no-op when page is already terminal.
- process_document: duplicate delivery is a no-op when document is past extraction.
- process_document: storage_object mismatch in payload → no-op (spoofed task rejected).
- process_document: tenant_id mismatch in payload → no-op (cross-tenant task rejected).
"""

from unittest.mock import patch

from app.modules.knowledge import service
from app.modules.knowledge.schemas import DocumentStatus, PageStatus, SourceType

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_page(db, tenant_id="t-1", job_id="job-1", page_id="page-1", status=PageStatus.QUEUED.value):
    db.put(
        f"tenants/{tenant_id}/crawl_jobs/{job_id}/pages/{page_id}",
        {
            "page_id": page_id,
            "url": "https://example.com/page",
            "status": status,
            "failure_stage": None,
            "error_message": None,
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "title": None,
        },
    )


def _seed_document(
    db,
    tenant_id="t-1",
    document_id="doc-1",
    object_path="tenants/t-1/documents/doc-1/original",
    status=DocumentStatus.QUEUED.value,
):
    db.put(
        f"tenants/{tenant_id}/documents/{document_id}",
        {
            "document_id": document_id,
            "tenant_id": tenant_id,
            "filename": "report.pdf",
            "source_type": SourceType.PDF.value,
            "storage_object": object_path,
            "status": status,
            "failure_stage": None,
            "error_message": None,
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "extracted_at": None,
            "title": None,
        },
    )


# ---------------------------------------------------------------------------
# process_page idempotency
# ---------------------------------------------------------------------------


class TestProcessPageIdempotency:
    def test_completed_page_is_skipped(self, fake_db):
        """A page already in COMPLETED state must not be re-processed."""
        _seed_page(fake_db, status=PageStatus.COMPLETED.value)

        with patch("app.modules.knowledge.service.publish") as mock_publish:
            # No fetch, no extraction should happen.
            service.process_page("t-1", "job-1", "page-1", "https://example.com/page")

        mock_publish.assert_not_called()

    def test_failed_page_is_skipped(self, fake_db):
        """A page already in FAILED state must not be re-processed."""
        _seed_page(fake_db, status=PageStatus.FAILED.value)

        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_page("t-1", "job-1", "page-1", "https://example.com/page")

        mock_publish.assert_not_called()

    def test_missing_page_record_is_no_op(self, fake_db):
        """A task for a non-existent page returns without error or event."""
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_page("t-1", "job-1", "ghost-page", "https://example.com")

        mock_publish.assert_not_called()


# ---------------------------------------------------------------------------
# process_document idempotency
# ---------------------------------------------------------------------------


class TestProcessDocumentIdempotency:
    def test_embedding_state_is_skipped(self, fake_db):
        """A document already in EMBEDDING state must not be re-processed."""
        _seed_document(fake_db, status=DocumentStatus.EMBEDDING.value)

        with patch("app.modules.knowledge.service.gcs.download_file") as mock_dl:
            with patch("app.modules.knowledge.service.publish") as mock_publish:
                service.process_document(
                    "t-1", "doc-1", "tenants/t-1/documents/doc-1/original"
                )

        mock_dl.assert_not_called()
        mock_publish.assert_not_called()

    def test_completed_state_is_skipped(self, fake_db):
        """A document already in COMPLETED state must not be re-processed."""
        _seed_document(fake_db, status=DocumentStatus.COMPLETED.value)

        with patch("app.modules.knowledge.service.gcs.download_file") as mock_dl:
            service.process_document(
                "t-1", "doc-1", "tenants/t-1/documents/doc-1/original"
            )

        mock_dl.assert_not_called()

    def test_failed_state_is_skipped(self, fake_db):
        """A document already in FAILED state must not be re-processed."""
        _seed_document(fake_db, status=DocumentStatus.FAILED.value)

        with patch("app.modules.knowledge.service.gcs.download_file") as mock_dl:
            service.process_document(
                "t-1", "doc-1", "tenants/t-1/documents/doc-1/original"
            )

        mock_dl.assert_not_called()

    def test_missing_document_record_is_no_op(self, fake_db):
        """A task for a non-existent document returns without error or event."""
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_document("t-1", "ghost-doc", "some/path")

        mock_publish.assert_not_called()


# ---------------------------------------------------------------------------
# WI-9: storage_object and tenant_id validation
# ---------------------------------------------------------------------------


class TestProcessDocumentPayloadValidation:
    def test_storage_object_mismatch_is_rejected(self, fake_db):
        """Task payload with wrong storage_object must be a no-op."""
        _seed_document(
            fake_db,
            object_path="tenants/t-1/documents/doc-1/original",
        )

        with patch("app.modules.knowledge.service.gcs.download_file") as mock_dl:
            with patch("app.modules.knowledge.service.publish") as mock_publish:
                # Payload claims a different storage path.
                service.process_document("t-1", "doc-1", "tenants/t-1/documents/SPOOFED/original")

        mock_dl.assert_not_called()
        mock_publish.assert_not_called()

    def test_tenant_id_mismatch_is_rejected(self, fake_db):
        """Task payload referencing a document from another tenant must be a no-op."""
        # Seed the doc under t-other.
        _seed_document(fake_db, tenant_id="t-other", document_id="doc-1")

        with patch("app.modules.knowledge.service.gcs.download_file") as mock_dl:
            with patch("app.modules.knowledge.service.publish") as mock_publish:
                # Payload claims t-1 but doc belongs to t-other.
                service.process_document("t-1", "doc-1", "tenants/t-other/documents/doc-1/original")

        mock_dl.assert_not_called()
        mock_publish.assert_not_called()
