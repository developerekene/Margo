"""Tests confirming that the knowledge service publishes the correct events.

Verifies:
  - PageExtracted published with the right fields on successful page extraction
  - DocumentExtracted published with the right fields on successful document extraction
  - DocumentDeleted published with the right fields on document deletion
  - Failed extractions do NOT publish events
"""

from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.knowledge import service
from app.modules.knowledge.schemas import DocumentStatus, PageStatus

# ---------------------------------------------------------------------------
# Shared seeding helpers
# ---------------------------------------------------------------------------


def _now():
    from datetime import UTC, datetime
    return datetime.now(UTC)


def _seed_page(db, tenant_id="t-1", job_id="job-1", page_id="pg-1",
               url="https://example.com", status=None):
    if status is None:
        status = PageStatus.QUEUED.value
    db.put(
        f"tenants/{tenant_id}/crawl_jobs/{job_id}",
        {
            "job_id": job_id,
            "tenant_id": tenant_id,
            "pages_failed": 0,
            "pages_completed": 0,
            "updated_at": _now(),
        },
    )
    db.put(
        f"tenants/{tenant_id}/crawl_jobs/{job_id}/pages/{page_id}",
        {
            "page_id": page_id,
            "url": url,
            "status": status,
            "failure_stage": None,
            "error_message": None,
            "updated_at": _now(),
        },
    )


def _seed_doc(db, tenant_id="t-1", doc_id="doc-1", source_type="pdf",
              status=None):
    if status is None:
        status = DocumentStatus.QUEUED.value
    db.put(
        f"tenants/{tenant_id}/documents/{doc_id}",
        {
            "document_id": doc_id,
            "tenant_id": tenant_id,
            "filename": "file.pdf",
            "source_type": source_type,
            "status": status,
            "storage_object": f"tenants/{tenant_id}/documents/{doc_id}/original",
            "failure_stage": None,
            "error_message": None,
            "updated_at": _now(),
        },
    )


def _seed_doc_for_delete(db, tenant_id="t-1", doc_id="doc-1"):
    db.put(
        f"tenants/{tenant_id}/documents/{doc_id}",
        {
            "document_id": doc_id,
            "tenant_id": tenant_id,
            "filename": "file.pdf",
            "source_type": "pdf",
            "status": DocumentStatus.EMBEDDING.value,
            "storage_object": f"tenants/{tenant_id}/documents/{doc_id}/original",
        },
    )


# ---------------------------------------------------------------------------
# PageExtracted event
# ---------------------------------------------------------------------------


class TestPageExtractedEvent:
    def test_page_extracted_published_with_correct_fields(self, fake_db):
        _seed_page(fake_db)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b"<html><body><p>content</p></body></html>"
        mock_response.url = "https://example.com"
        mock_response.headers = {"content-type": "text/html"}

        with (
            patch("httpx.get", return_value=mock_response),
            patch(
                "app.modules.knowledge.service.extract_html",
                return_value=("My Title", "My content"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        mock_publish.assert_called_once_with(
            "PageExtracted",
            tenant_id="t-1",
            url="https://example.com",
            title="My Title",
            content="My content",
        )

    def test_page_extracted_not_published_on_fetch_failure(self, fake_db):
        _seed_page(fake_db)
        import httpx

        with (
            patch(
                "httpx.get",
                side_effect=httpx.ConnectError("connection refused"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            with pytest.raises(AppError) as exc_info:
                service.process_page("t-1", "job-1", "pg-1", "https://example.com")

            assert exc_info.value.status_code == 503
            mock_publish.assert_not_called()

    def test_page_extracted_not_published_on_extraction_failure(self, fake_db):
        _seed_page(fake_db)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b""

        with (
            patch("httpx.get", return_value=mock_response),
            patch(
                "app.modules.knowledge.service.extract_html",
                side_effect=ValueError("empty"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        mock_publish.assert_not_called()

    def test_page_extracted_not_published_when_already_terminal(self, fake_db):
        _seed_page(fake_db, status=PageStatus.COMPLETED.value)
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")
        mock_publish.assert_not_called()


# ---------------------------------------------------------------------------
# DocumentExtracted event
# ---------------------------------------------------------------------------


class TestDocumentExtractedEvent:
    def test_document_extracted_published_with_correct_fields_pdf(self, fake_db):
        _seed_doc(fake_db, source_type="pdf")
        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"%PDF-1.4 fake",
            ),
            patch(
                "app.modules.knowledge.service.extract_pdf",
                return_value=("PDF Title", "PDF content text"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        mock_publish.assert_called_once_with(
            "DocumentExtracted",
            tenant_id="t-1",
            document_id="doc-1",
            source_type="pdf",
            title="PDF Title",
            content="PDF content text",
        )

    def test_document_extracted_published_with_correct_fields_markdown(self, fake_db):
        _seed_doc(fake_db, source_type="markdown")
        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"# Title\n\nContent",
            ),
            patch(
                "app.modules.knowledge.service.extract_markdown",
                return_value=("MD Title", "MD content"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        mock_publish.assert_called_once_with(
            "DocumentExtracted",
            tenant_id="t-1",
            document_id="doc-1",
            source_type="markdown",
            title="MD Title",
            content="MD content",
        )

    def test_document_extracted_not_published_on_download_failure(self, fake_db):
        _seed_doc(fake_db)
        from app.core.responses import AppError

        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                side_effect=AppError("storage_download_failed", "oops", 503),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        mock_publish.assert_not_called()

    def test_document_extracted_not_published_on_extraction_failure(self, fake_db):
        _seed_doc(fake_db, source_type="pdf")
        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"%PDF-1.4 fake",
            ),
            patch(
                "app.modules.knowledge.service.extract_pdf",
                side_effect=ValueError("no text"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        mock_publish.assert_not_called()


# ---------------------------------------------------------------------------
# DocumentDeleted event
# ---------------------------------------------------------------------------


class TestDocumentDeletedEvent:
    def test_document_deleted_published_on_delete(self, fake_db):
        _seed_doc_for_delete(fake_db)
        with (
            patch("app.modules.knowledge.service.gcs.delete_file"),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.delete_document("t-1", "doc-1")

        mock_publish.assert_called_once_with(
            "DocumentDeleted",
            tenant_id="t-1",
            document_id="doc-1",
        )

    def test_document_deleted_not_published_when_doc_not_found(self, fake_db):
        from app.core.responses import AppError

        with patch("app.modules.knowledge.service.publish") as mock_publish:
            with pytest.raises(AppError):
                service.delete_document("t-1", "no-such-doc")

        mock_publish.assert_not_called()
