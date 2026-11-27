"""WI-8: Document deletion workflow — GCS/Firestore atomicity and idempotency.

Verifies:
- GCS delete failure → 503 raised, Firestore record preserved, no event published.
- Successful deletion → Firestore record removed, DocumentDeleted published.
- Repeated deletion → 404 on the second call (idempotent from the client's view).
- Missing document → 404.
"""

from unittest.mock import patch, call

import pytest

from app.core.responses import AppError
from app.modules.knowledge import service
from app.modules.knowledge.schemas import DocumentStatus, SourceType
from tests.fake_firestore import FakeDB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_document(db, tenant_id="t-1", document_id="doc-1", object_path="tenants/t-1/documents/doc-1/original"):
    db.put(
        f"tenants/{tenant_id}/documents/{document_id}",
        {
            "document_id": document_id,
            "tenant_id": tenant_id,
            "filename": "report.pdf",
            "source_type": SourceType.PDF.value,
            "storage_object": object_path,
            "status": DocumentStatus.COMPLETED.value,
            "failure_stage": None,
            "error_message": None,
            "created_at": "2024-01-01T00:00:00+00:00",
            "updated_at": "2024-01-01T00:00:00+00:00",
            "extracted_at": None,
            "title": "Report",
        },
    )


def _doc_exists(fake_db, tenant_id="t-1", document_id="doc-1") -> bool:
    return f"tenants/{tenant_id}/documents/{document_id}" in fake_db.store


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDeleteDocument:
    def test_gcs_failure_preserves_firestore_record(self, fake_db):
        """If GCS delete fails, the Firestore record must NOT be deleted."""
        _seed_document(fake_db)

        with patch(
            "app.modules.knowledge.service.gcs.delete_file",
            side_effect=AppError("storage_delete_failed", "GCS error", 503),
        ):
            with patch("app.modules.knowledge.service.publish") as mock_publish:
                with pytest.raises(AppError) as exc_info:
                    service.delete_document("t-1", "doc-1")

        # 503 raised to the caller.
        assert exc_info.value.status_code == 503

        # Firestore record is still there — the client can retry.
        assert _doc_exists(fake_db), "Firestore record must survive a GCS failure"

        # DocumentDeleted must NOT be published.
        mock_publish.assert_not_called()

    def test_successful_deletion_removes_record_and_publishes_event(self, fake_db):
        """Happy path: GCS succeeded → Firestore record removed → event published."""
        _seed_document(fake_db)

        with patch("app.modules.knowledge.service.gcs.delete_file") as mock_gcs:
            with patch("app.modules.knowledge.service.publish") as mock_publish:
                service.delete_document("t-1", "doc-1")

        # GCS delete was called.
        mock_gcs.assert_called_once()

        # Firestore record is gone.
        assert not _doc_exists(fake_db), "Firestore record must be removed on success"

        # DocumentDeleted event was published.
        mock_publish.assert_called_once_with(
            "DocumentDeleted",
            tenant_id="t-1",
            document_id="doc-1",
        )

    def test_repeated_deletion_returns_404(self, fake_db):
        """Second DELETE on the same document returns 404 (idempotent from API view)."""
        _seed_document(fake_db)

        with patch("app.modules.knowledge.service.gcs.delete_file"):
            with patch("app.modules.knowledge.service.publish"):
                service.delete_document("t-1", "doc-1")

        # Second call — record is already gone.
        with patch("app.modules.knowledge.service.gcs.delete_file"):
            with pytest.raises(AppError) as exc_info:
                service.delete_document("t-1", "doc-1")

        assert exc_info.value.status_code == 404

    def test_missing_document_returns_404(self, fake_db):
        """Attempting to delete a non-existent document raises 404."""
        with pytest.raises(AppError) as exc_info:
            service.delete_document("t-1", "nonexistent-doc")

        assert exc_info.value.status_code == 404

    def test_document_belonging_to_another_tenant_returns_404(self, fake_db):
        """tenant_id isolation: cannot delete a document from a different tenant."""
        _seed_document(fake_db, tenant_id="t-other", document_id="doc-1")

        # Seed the requesting tenant's root so it exists.
        fake_db.put("tenants/t-1", {"tenant_id": "t-1"})

        with pytest.raises(AppError) as exc_info:
            service.delete_document("t-1", "doc-1")

        assert exc_info.value.status_code == 404

    def test_no_gcs_call_when_storage_object_missing(self, fake_db):
        """If a document has no storage_object, GCS is not called."""
        fake_db.put(
            "tenants/t-1/documents/doc-1",
            {
                "document_id": "doc-1",
                "tenant_id": "t-1",
                "storage_object": None,
                "status": DocumentStatus.FAILED.value,
            },
        )

        with patch("app.modules.knowledge.service.gcs.delete_file") as mock_gcs:
            with patch("app.modules.knowledge.service.publish"):
                service.delete_document("t-1", "doc-1")

        mock_gcs.assert_not_called()
