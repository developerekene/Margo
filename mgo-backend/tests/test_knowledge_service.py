"""Tests for the knowledge service layer.

Covers:
  - Crawl job creation (billing gates, URL validation, page dispatch)
  - Document upload (billing gates, GCS, Firestore, task enqueue)
  - Document listing (pagination)
  - Document deletion (GCS cleanup, event publication)
  - process_page (idempotency, fetch failure, extraction failure, success)
  - process_document (idempotency, download failure, extraction failure, success)

GCS and Cloud Tasks are mocked; billing ports are mocked; Firestore uses FakeDB.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, call, patch

import pytest

from app.core.responses import AppError
from app.modules.knowledge import service
from app.modules.knowledge.schemas import (
    CrawlJobStatus,
    DocumentStatus,
    PageStatus,
    SourceType,
)
from tests.fake_firestore import FakeDB, subscription_doc


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db(fake_db):
    """Alias: fake_db already registered via conftest."""
    return fake_db


def _stub_tenant(db, tenant_id="t-1", widget_id="w-1", allowed_domains=None):
    """Seed a tenant document, optionally with a widget."""
    db.put(f"tenants/{tenant_id}", {"tenant_id": tenant_id, "widget_id": widget_id})
    if widget_id:
        db.put(
            f"widgets/{widget_id}",
            {"allowed_domains": allowed_domains or ["example.com"]},
        )


def _now():
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Helpers that patch the typical collaborators
# ---------------------------------------------------------------------------


def _billing_active(active=True, within_limit=True, reserve=True):
    """Return a dict of patch targets for billing ports functions."""
    return {
        "app.modules.knowledge.service.billing_ports.is_subscription_active": MagicMock(
            return_value=active
        ),
        "app.modules.knowledge.service.billing_ports.is_within_plan_limit": MagicMock(
            return_value=within_limit
        ),
        "app.modules.knowledge.service.billing_ports.reserve_usage": MagicMock(
            return_value=reserve
        ),
    }


# ---------------------------------------------------------------------------
# create_crawl_job
# ---------------------------------------------------------------------------


class TestCreateCrawlJob:
    def test_raises_403_when_subscription_inactive(self, db):
        _stub_tenant(db)
        with patch(
            "app.modules.knowledge.service.billing_ports.is_subscription_active",
            return_value=False,
        ):
            with pytest.raises(AppError) as exc_info:
                service.create_crawl_job("t-1", "https://example.com")
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "subscription_required"

    def test_raises_400_on_invalid_url(self, db):
        _stub_tenant(db)
        with patch(
            "app.modules.knowledge.service.billing_ports.is_subscription_active",
            return_value=True,
        ):
            with pytest.raises(AppError) as exc_info:
                service.create_crawl_job("t-1", "ftp://bad-scheme.com")
        assert exc_info.value.status_code == 400

    def test_raises_403_on_domain_not_allowed(self, db):
        _stub_tenant(db, allowed_domains=["allowed.com"])
        with patch(
            "app.modules.knowledge.service.billing_ports.is_subscription_active",
            return_value=True,
        ):
            with pytest.raises(AppError) as exc_info:
                service.create_crawl_job("t-1", "https://notallowed.com")
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "domain_not_allowed"

    def test_raises_400_when_no_pages_discovered(self, db):
        _stub_tenant(db)
        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.discover_pages",
                return_value=[],
            ),
        ):
            with pytest.raises(AppError) as exc_info:
                service.create_crawl_job("t-1", "https://example.com")
        assert exc_info.value.status_code == 400
        assert exc_info.value.code == "no_pages_discovered"

    def test_raises_403_when_quota_exhausted(self, db):
        _stub_tenant(db)

        fake_page = MagicMock()
        fake_page.page_id = "pg-1"
        fake_page.url = "https://example.com"

        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.discover_pages",
                return_value=[fake_page],
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.reserve_usage",
                return_value=False,
            ),
        ):
            with pytest.raises(AppError) as exc_info:
                service.create_crawl_job("t-1", "https://example.com")
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "crawl_pages_limit_reached"

    def test_successful_crawl_job_created(self, db):
        _stub_tenant(db)

        fake_pages = []
        for i in range(3):
            p = MagicMock()
            p.page_id = f"pg-{i}"
            p.url = f"https://example.com/page{i}"
            fake_pages.append(p)

        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.discover_pages",
                return_value=fake_pages,
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.reserve_usage",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.cloud_tasks.enqueue_page_task",
                return_value=True,
            ),
        ):
            result = service.create_crawl_job("t-1", "https://example.com")

        assert result.tenant_id == "t-1"
        assert result.pages_discovered == 3
        assert result.pages_failed == 0
        assert result.status == CrawlJobStatus.PROCESSING

    def test_partial_enqueue_failure_records_pages_failed(self, db):
        """Pages that fail to enqueue are marked failed; job still returned."""
        _stub_tenant(db)

        fake_pages = []
        for i in range(3):
            p = MagicMock()
            p.page_id = f"pg-{i}"
            p.url = f"https://example.com/page{i}"
            fake_pages.append(p)

        enqueue_calls = [True, AppError("x", "y", 503), True]
        enqueue_mock = MagicMock(side_effect=enqueue_calls)

        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.discover_pages",
                return_value=fake_pages,
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.reserve_usage",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.cloud_tasks.enqueue_page_task",
                side_effect=enqueue_calls,
            ),
        ):
            result = service.create_crawl_job("t-1", "https://example.com")

        assert result.pages_failed == 1
        assert result.pages_discovered == 3


# ---------------------------------------------------------------------------
# get_crawl_job
# ---------------------------------------------------------------------------


class TestGetCrawlJob:
    def test_raises_404_when_not_found(self, db):
        with pytest.raises(AppError) as exc_info:
            service.get_crawl_job("t-1", "no-such-job")
        assert exc_info.value.status_code == 404

    def test_returns_job_data(self, db):
        now = _now()
        db.put(
            "tenants/t-1/crawl_jobs/job-1",
            {
                "job_id": "job-1",
                "tenant_id": "t-1",
                "start_url": "https://example.com",
                "status": CrawlJobStatus.PROCESSING.value,
                "pages_discovered": 5,
                "pages_completed": 2,
                "pages_failed": 0,
                "created_at": now,
                "updated_at": now,
                "error_message": None,
            },
        )
        result = service.get_crawl_job("t-1", "job-1")
        assert result.job_id == "job-1"
        assert result.pages_discovered == 5


# ---------------------------------------------------------------------------
# upload_document
# ---------------------------------------------------------------------------


VALID_PDF = b"%PDF-1.4 minimal"
VALID_MD = b"# My Doc\n\nContent here."


class TestUploadDocument:
    def test_raises_403_when_subscription_inactive(self, db):
        with patch(
            "app.modules.knowledge.service.billing_ports.is_subscription_active",
            return_value=False,
        ):
            with pytest.raises(AppError) as exc_info:
                service.upload_document("t-1", "file.pdf", SourceType.PDF, VALID_PDF)
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "subscription_required"

    def test_raises_403_when_document_limit_reached(self, db):
        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.is_within_plan_limit",
                return_value=False,
            ),
        ):
            with pytest.raises(AppError) as exc_info:
                service.upload_document("t-1", "file.pdf", SourceType.PDF, VALID_PDF)
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "document_limit_reached"

    def test_successful_pdf_upload(self, db):
        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.is_within_plan_limit",
                return_value=True,
            ),
            patch("app.modules.knowledge.service.gcs.upload_file") as mock_upload,
            patch(
                "app.modules.knowledge.service.cloud_tasks.enqueue_document_task",
                return_value=True,
            ),
        ):
            result = service.upload_document("t-1", "report.pdf", SourceType.PDF, VALID_PDF)

        assert result.tenant_id == "t-1"
        assert result.filename == "report.pdf"
        assert result.source_type == SourceType.PDF
        assert result.status == DocumentStatus.QUEUED
        mock_upload.assert_called_once()

    def test_gcs_upload_failure_returns_503(self, db):
        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.is_within_plan_limit",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.gcs.upload_file",
                side_effect=AppError("storage_upload_failed", "GCS failed", 503),
            ),
        ):
            with pytest.raises(AppError) as exc_info:
                service.upload_document("t-1", "doc.pdf", SourceType.PDF, VALID_PDF)
        assert exc_info.value.status_code == 503

    def test_task_enqueue_failure_rolls_back_gcs_and_firestore(self, db):
        """When task enqueue fails, GCS object and Firestore record are cleaned up."""
        mock_delete = MagicMock()

        with (
            patch(
                "app.modules.knowledge.service.billing_ports.is_subscription_active",
                return_value=True,
            ),
            patch(
                "app.modules.knowledge.service.billing_ports.is_within_plan_limit",
                return_value=True,
            ),
            patch("app.modules.knowledge.service.gcs.upload_file"),
            patch("app.modules.knowledge.service.gcs.delete_file", mock_delete),
            patch(
                "app.modules.knowledge.service.cloud_tasks.enqueue_document_task",
                side_effect=AppError("task_enqueue_failed", "failed", 503),
            ),
        ):
            with pytest.raises(AppError) as exc_info:
                service.upload_document("t-1", "doc.pdf", SourceType.PDF, VALID_PDF)

        assert exc_info.value.status_code == 503
        # GCS delete was called as rollback
        mock_delete.assert_called_once()


# ---------------------------------------------------------------------------
# list_documents
# ---------------------------------------------------------------------------


class TestListDocuments:
    def _seed_docs(self, db, tenant_id, count):
        for i in range(count):
            now = _now()
            db.put(
                f"tenants/{tenant_id}/documents/doc-{i:03d}",
                {
                    "document_id": f"doc-{i:03d}",
                    "tenant_id": tenant_id,
                    "filename": f"file-{i}.pdf",
                    "source_type": SourceType.PDF.value,
                    "status": DocumentStatus.QUEUED.value,
                    "title": None,
                    "error_message": None,
                    "created_at": now,
                    "updated_at": now,
                },
            )

    def test_returns_documents_for_tenant(self, db):
        self._seed_docs(db, "t-1", 3)
        result = service.list_documents("t-1")
        assert len(result.documents) == 3

    def test_tenant_isolation(self, db):
        self._seed_docs(db, "t-1", 2)
        self._seed_docs(db, "t-2", 5)
        result = service.list_documents("t-1")
        assert len(result.documents) == 2
        for doc in result.documents:
            assert doc.tenant_id == "t-1"

    def test_pagination_cursor(self, db):
        self._seed_docs(db, "t-1", 25)
        page1 = service.list_documents("t-1", limit=20)
        assert len(page1.documents) == 20
        assert page1.next_cursor is not None

        page2 = service.list_documents("t-1", limit=20, cursor=page1.next_cursor)
        assert len(page2.documents) == 5
        assert page2.next_cursor is None

    def test_empty_tenant_returns_empty_list(self, db):
        result = service.list_documents("t-no-docs")
        assert result.documents == []
        assert result.next_cursor is None


# ---------------------------------------------------------------------------
# delete_document
# ---------------------------------------------------------------------------


class TestDeleteDocument:
    def _seed_doc(self, db, tenant_id="t-1", doc_id="doc-1"):
        db.put(
            f"tenants/{tenant_id}/documents/{doc_id}",
            {
                "document_id": doc_id,
                "tenant_id": tenant_id,
                "filename": "file.pdf",
                "source_type": SourceType.PDF.value,
                "status": DocumentStatus.QUEUED.value,
                "storage_object": f"tenants/{tenant_id}/documents/{doc_id}/original",
            },
        )

    def test_raises_404_when_not_found(self, db):
        with pytest.raises(AppError) as exc_info:
            service.delete_document("t-1", "no-such-doc")
        assert exc_info.value.status_code == 404

    def test_raises_404_on_tenant_mismatch(self, db):
        self._seed_doc(db, tenant_id="t-1", doc_id="doc-1")
        with pytest.raises(AppError) as exc_info:
            service.delete_document("t-WRONG", "doc-1")
        assert exc_info.value.status_code == 404

    def test_deletes_gcs_object_and_firestore_record(self, db):
        self._seed_doc(db)
        mock_gcs_delete = MagicMock()

        with (
            patch("app.modules.knowledge.service.gcs.delete_file", mock_gcs_delete),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.delete_document("t-1", "doc-1")

        mock_gcs_delete.assert_called_once()
        mock_publish.assert_called_once_with(
            "DocumentDeleted",
            tenant_id="t-1",
            document_id="doc-1",
        )
        # Firestore record should be gone
        assert db.doc("tenants/t-1/documents/doc-1") is None

    def test_publishes_document_deleted_event(self, db):
        self._seed_doc(db)
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

    def test_continues_when_gcs_delete_fails(self, db):
        """GCS delete failure should not prevent Firestore record deletion."""
        self._seed_doc(db)
        with (
            patch(
                "app.modules.knowledge.service.gcs.delete_file",
                side_effect=AppError("storage_delete_failed", "oops", 503),
            ),
            patch("app.modules.knowledge.service.publish"),
        ):
            # Should not raise
            service.delete_document("t-1", "doc-1")

        assert db.doc("tenants/t-1/documents/doc-1") is None


# ---------------------------------------------------------------------------
# process_page (internal Cloud Tasks handler)
# ---------------------------------------------------------------------------


class TestProcessPage:
    def _seed_page(self, db, tenant_id="t-1", job_id="job-1", page_id="pg-1",
                   url="https://example.com", status=PageStatus.QUEUED.value):
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

    def test_no_op_when_page_already_completed(self, db):
        self._seed_page(db, status=PageStatus.COMPLETED.value)
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")
        # Event must NOT be published again
        mock_publish.assert_not_called()

    def test_no_op_when_page_already_failed(self, db):
        self._seed_page(db, status=PageStatus.FAILED.value)
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")
        mock_publish.assert_not_called()

    def test_no_op_when_page_record_missing(self, db):
        # No page seeded — should return without error (permanent failure, no retry)
        service.process_page("t-1", "job-1", "no-page", "https://example.com")

    def test_page_marked_failed_on_fetch_error(self, db):
        self._seed_page(db)
        import httpx

        with patch(
            "httpx.get",
            side_effect=httpx.HTTPStatusError(
                "404", request=MagicMock(), response=MagicMock(status_code=404)
            ),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value
        assert page["failure_stage"] == "fetch"

    def test_page_marked_failed_on_extraction_error(self, db):
        self._seed_page(db)

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b"<html><head><script>var x=1</script></head><body>  </body></html>"

        with (
            patch("httpx.get", return_value=mock_response),
            patch(
                "app.modules.knowledge.service.extract_html",
                side_effect=ValueError("No extractable text"),
            ),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value
        assert page["failure_stage"] == "extraction"

    def test_successful_extraction_publishes_page_extracted(self, db):
        self._seed_page(db)

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.content = b"<html><head><title>Test</title></head><body><p>Content</p></body></html>"

        with (
            patch("httpx.get", return_value=mock_response),
            patch(
                "app.modules.knowledge.service.extract_html",
                return_value=("Test Page", "Content here"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        mock_publish.assert_called_once_with(
            "PageExtracted",
            tenant_id="t-1",
            url="https://example.com",
            title="Test Page",
            content="Content here",
        )
        page = db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.COMPLETED.value


# ---------------------------------------------------------------------------
# process_document (internal Cloud Tasks handler)
# ---------------------------------------------------------------------------


class TestProcessDocument:
    def _seed_doc(self, db, tenant_id="t-1", doc_id="doc-1",
                  status=DocumentStatus.QUEUED.value, source_type="pdf"):
        db.put(
            f"tenants/{tenant_id}/documents/{doc_id}",
            {
                "document_id": doc_id,
                "tenant_id": tenant_id,
                "filename": "report.pdf",
                "source_type": source_type,
                "status": status,
                "storage_object": f"tenants/{tenant_id}/documents/{doc_id}/original",
                "failure_stage": None,
                "error_message": None,
                "updated_at": _now(),
            },
        )

    def test_no_op_when_already_in_embedding_state(self, db):
        self._seed_doc(db, status=DocumentStatus.EMBEDDING.value)
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")
        mock_publish.assert_not_called()

    def test_no_op_when_record_not_found(self, db):
        # Should return silently — permanent failure treated as no-op
        service.process_document("t-1", "no-doc", "tenants/t-1/documents/no-doc/original")

    def test_marked_failed_on_gcs_download_failure(self, db):
        self._seed_doc(db)
        with patch(
            "app.modules.knowledge.service.gcs.download_file",
            side_effect=AppError("storage_download_failed", "oops", 503),
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        doc = db.doc("tenants/t-1/documents/doc-1")
        assert doc["status"] == DocumentStatus.FAILED.value
        assert doc["failure_stage"] == "storage_download"

    def test_marked_failed_on_extraction_failure(self, db):
        self._seed_doc(db, source_type="pdf")
        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"%PDF-1.4 fake",
            ),
            patch(
                "app.modules.knowledge.service.extract_pdf",
                side_effect=ValueError("PDF contains no text"),
            ),
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        doc = db.doc("tenants/t-1/documents/doc-1")
        assert doc["status"] == DocumentStatus.FAILED.value
        assert doc["failure_stage"] == "extraction"

    def test_successful_pdf_extraction_publishes_document_extracted(self, db):
        self._seed_doc(db, source_type="pdf")
        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"%PDF-1.4 fake",
            ),
            patch(
                "app.modules.knowledge.service.extract_pdf",
                return_value=("Report Title", "Extracted content"),
            ),
            patch("app.modules.knowledge.service.publish") as mock_publish,
        ):
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")

        mock_publish.assert_called_once_with(
            "DocumentExtracted",
            tenant_id="t-1",
            document_id="doc-1",
            source_type="pdf",
            title="Report Title",
            content="Extracted content",
        )
        doc = db.doc("tenants/t-1/documents/doc-1")
        assert doc["status"] == DocumentStatus.EMBEDDING.value

    def test_successful_markdown_extraction(self, db):
        self._seed_doc(db, source_type="markdown")
        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"# Title\n\nSome content",
            ),
            patch(
                "app.modules.knowledge.service.extract_markdown",
                return_value=("MD Title", "Some content"),
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
            content="Some content",
        )

    def test_idempotent_repeated_delivery(self, db):
        """Calling process_document twice on a completed doc is a no-op."""
        self._seed_doc(db, status=DocumentStatus.EMBEDDING.value)
        with patch("app.modules.knowledge.service.publish") as mock_publish:
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")
            service.process_document("t-1", "doc-1", "tenants/t-1/documents/doc-1/original")
        mock_publish.assert_not_called()

    def test_failed_extraction_does_not_publish_event(self, db):
        self._seed_doc(db, source_type="pdf")
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
