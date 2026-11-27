"""Regression tests for WI-2, WI-3, WI-4, and WI-5.

WI-2: Transient fetch failure classification and Cloud Tasks retry behaviour.
WI-3: Publish-before-terminal-status ordering so a failed publish does not
      leave a page/document permanently marked as completed.
WI-4: SSRF hardening during the actual page fetch (redirect IP check,
      content-type validation, response-size limit, redirect count cap).
WI-5: Invalid/deleted cursor returns 400; cross-tenant safety is documented.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.knowledge import service
from app.modules.knowledge.schemas import DocumentStatus, PageStatus

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _seed_page(db, *, status=PageStatus.PENDING.value):
    db.set(
        "tenants/t-1/crawl_jobs/job-1/pages/pg-1",
        {
            "page_id": "pg-1",
            "tenant_id": "t-1",
            "job_id": "job-1",
            "url": "https://example.com",
            "status": status,
            "created_at": _utc(),
            "updated_at": _utc(),
        },
    )
    db.set(
        "tenants/t-1/crawl_jobs/job-1",
        {
            "job_id": "job-1",
            "tenant_id": "t-1",
            "status": "processing",
            "pages_discovered": 1,
            "pages_completed": 0,
            "pages_failed": 0,
            "created_at": _utc(),
            "updated_at": _utc(),
        },
    )


def _seed_doc(db, *, status=DocumentStatus.PENDING.value):
    db.set(
        "tenants/t-1/documents/doc-1",
        {
            "document_id": "doc-1",
            "tenant_id": "t-1",
            "filename": "test.pdf",
            "source_type": "pdf",
            "storage_object": "tenants/t-1/documents/doc-1/original",
            "status": status,
            "created_at": _utc(),
            "updated_at": _utc(),
        },
    )


def _ok_response(*, url="https://example.com", content_type="text/html; charset=utf-8"):
    """Return a minimal httpx-like response mock that passes all WI-4 checks."""
    r = MagicMock()
    r.raise_for_status = MagicMock()
    r.content = b"<html><head><title>T</title></head><body><p>content</p></body></html>"
    r.headers = {"content-type": content_type}
    r.url = url
    return r


# ---------------------------------------------------------------------------
# WI-2: Transient fetch failure classification
# ---------------------------------------------------------------------------


class TestFetchRetryClassification:
    """WI-2: transient errors must raise AppError 503 (Cloud Tasks retries);
    permanent errors must mark the page FAILED and return cleanly.
    """

    def test_timeout_raises_503_so_cloud_tasks_retries(self, fake_db):
        import httpx

        _seed_page(fake_db)

        with (
            patch("httpx.get", side_effect=httpx.TimeoutException("timed out")),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            with pytest.raises(AppError) as exc_info:
                service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        assert exc_info.value.status_code == 503
        # Page must NOT be marked FAILED — it must stay in EXTRACTING so the
        # Cloud Tasks retry can re-process it.
        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] != PageStatus.FAILED.value

    def test_connect_error_raises_503(self, fake_db):
        import httpx

        _seed_page(fake_db)

        with (
            patch("httpx.get", side_effect=httpx.ConnectError("refused")),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            with pytest.raises(AppError) as exc_info:
                service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        assert exc_info.value.status_code == 503

    def test_remote_5xx_raises_503(self, fake_db):
        import httpx

        _seed_page(fake_db)

        resp = MagicMock()
        resp.status_code = 503

        with (
            patch(
                "httpx.get",
                side_effect=httpx.HTTPStatusError(
                    "503", request=MagicMock(), response=resp
                ),
            ),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            with pytest.raises(AppError) as exc_info:
                service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        assert exc_info.value.status_code == 503

    def test_remote_4xx_marks_page_failed_permanently(self, fake_db):
        """4xx responses are permanent — the page is marked FAILED, Cloud Tasks
        is returned 200 and does NOT retry.
        """
        import httpx

        _seed_page(fake_db)

        resp = MagicMock()
        resp.status_code = 404

        with (
            patch(
                "httpx.get",
                side_effect=httpx.HTTPStatusError(
                    "404", request=MagicMock(), response=resp
                ),
            ),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            # Must NOT raise — returns cleanly so Cloud Tasks sees 200.
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value
        assert page["failure_stage"] == "fetch"

    def test_too_many_redirects_marks_page_failed_permanently(self, fake_db):
        import httpx

        _seed_page(fake_db)

        with (
            patch(
                "httpx.get",
                side_effect=httpx.TooManyRedirects("loop", request=MagicMock()),
            ),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value

    def test_exactly_once_counter_on_permanent_failure(self, fake_db):
        """The failed-counter is incremented exactly once for a permanent failure."""
        import httpx

        _seed_page(fake_db)

        resp = MagicMock()
        resp.status_code = 410  # permanent 4xx

        with (
            patch(
                "httpx.get",
                side_effect=httpx.HTTPStatusError(
                    "410", request=MagicMock(), response=resp
                ),
            ),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        job = fake_db.doc("tenants/t-1/crawl_jobs/job-1")
        assert job["pages_failed"] == 1
        assert job["pages_completed"] == 0


# ---------------------------------------------------------------------------
# WI-3: Publish-before-terminal-status (retry safety)
# ---------------------------------------------------------------------------


class TestPublishBeforeTerminalStatus:
    """WI-3: A failed publish must leave the page/document in a non-terminal
    state so Cloud Tasks can retry and re-deliver the event.
    """

    def test_failed_page_publish_raises_503_and_page_stays_extracting(self, fake_db):
        """If publish(PageExtracted) raises, the page must not be COMPLETED.

        The page will be in EXTRACTING state; Cloud Tasks receives 503 and
        retries, re-extracting the page and re-publishing the event.
        """
        _seed_page(fake_db)

        def boom_publish(*args, **kwargs):
            raise RuntimeError("embedding service unreachable")

        with (
            patch("httpx.get", return_value=_ok_response()),
            patch(
                "app.modules.knowledge.service.extract_html",
                return_value=("Title", "Content"),
            ),
            patch("app.modules.knowledge.service.publish", side_effect=boom_publish),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            with pytest.raises(AppError) as exc_info:
                service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        assert exc_info.value.status_code == 503

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        # Must NOT be COMPLETED — it must be retryable.
        assert page["status"] != PageStatus.COMPLETED.value

        # Job completed counter must NOT have been incremented.
        job = fake_db.doc("tenants/t-1/crawl_jobs/job-1")
        assert job["pages_completed"] == 0

    def test_failed_document_publish_raises_503_and_doc_stays_extracting(self, fake_db):
        """If publish(DocumentExtracted) raises, the document must not be EMBEDDING.

        The document stays in EXTRACTING so Cloud Tasks can retry.
        """
        _seed_doc(fake_db)

        def boom_publish(*args, **kwargs):
            raise RuntimeError("embedding service unreachable")

        with (
            patch(
                "app.modules.knowledge.service.gcs.download_file",
                return_value=b"%PDF-1.4 fake",
            ),
            patch(
                "app.modules.knowledge.service.extract_pdf",
                return_value=("Title", "Content"),
            ),
            patch("app.modules.knowledge.service.publish", side_effect=boom_publish),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            with pytest.raises(AppError) as exc_info:
                service.process_document(
                    "t-1", "doc-1", "tenants/t-1/documents/doc-1/original"
                )

        assert exc_info.value.status_code == 503

        doc = fake_db.doc("tenants/t-1/documents/doc-1")
        assert doc["status"] != DocumentStatus.EMBEDDING.value

    def test_successful_page_publish_marks_page_completed(self, fake_db):
        """When publish succeeds, the page IS marked COMPLETED and counter updated."""
        _seed_page(fake_db)

        with (
            patch("httpx.get", return_value=_ok_response()),
            patch(
                "app.modules.knowledge.service.extract_html",
                return_value=("Title", "Content"),
            ),
            patch("app.modules.knowledge.service.publish"),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.COMPLETED.value

        job = fake_db.doc("tenants/t-1/crawl_jobs/job-1")
        assert job["pages_completed"] == 1


# ---------------------------------------------------------------------------
# WI-4: SSRF hardening during actual fetch
# ---------------------------------------------------------------------------


class TestFetchSSRFHardening:
    """WI-4: Post-fetch security checks on redirects, content-type, and size."""

    def test_redirect_to_private_ip_marks_page_failed(self, fake_db):
        """A redirect that resolves to a private IP must be blocked permanently."""
        _seed_page(fake_db)

        r = _ok_response()
        r.url = "http://169.254.169.254/latest/meta-data/"  # GCP metadata

        with (
            patch("httpx.get", return_value=r),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value
        assert "private" in page["error_message"].lower() or "blocked" in page["error_message"].lower()

    def test_non_html_content_type_marks_page_failed(self, fake_db):
        """A response with a non-text content-type (e.g. application/pdf) is rejected."""
        _seed_page(fake_db)

        r = _ok_response(content_type="application/pdf")

        with (
            patch("httpx.get", return_value=r),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value
        assert page["failure_stage"] == "fetch"

    def test_oversized_response_marks_page_failed(self, fake_db):
        """A response body that exceeds the configured size limit is rejected."""
        _seed_page(fake_db)

        from app.core.config import settings

        r = _ok_response()
        # Build a body that exceeds max bytes (KNOWLEDGE_MAX_CONTENT_CHARS * 4).
        limit = settings.KNOWLEDGE_MAX_CONTENT_CHARS * 4
        r.content = b"x" * (limit + 1)

        with (
            patch("httpx.get", return_value=r),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.FAILED.value
        assert page["failure_stage"] == "fetch"

    def test_acceptable_response_passes_all_checks(self, fake_db):
        """A well-formed response passes redirect, content-type, and size checks."""
        _seed_page(fake_db)

        with (
            patch("httpx.get", return_value=_ok_response()),
            patch(
                "app.modules.knowledge.service.extract_html",
                return_value=("T", "C"),
            ),
            patch("app.modules.knowledge.service.publish"),
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
        ):
            # Must not raise or fail.
            service.process_page("t-1", "job-1", "pg-1", "https://example.com")

        page = fake_db.doc("tenants/t-1/crawl_jobs/job-1/pages/pg-1")
        assert page["status"] == PageStatus.COMPLETED.value


# ---------------------------------------------------------------------------
# WI-5: Cursor validation
# ---------------------------------------------------------------------------


class TestPaginationCursorValidation:
    """WI-5: Deleted cursor raises AppError 400; cross-tenant safety documented."""

    def _seed_docs(self, db, tenant_id: str, count: int = 3):
        for i in range(count):
            db.set(
                f"tenants/{tenant_id}/documents/doc-{i}",
                {
                    "document_id": f"doc-{i}",
                    "tenant_id": tenant_id,
                    "filename": f"file-{i}.pdf",
                    "source_type": "pdf",
                    "status": DocumentStatus.COMPLETED.value,
                    "created_at": _utc(),
                    "updated_at": _utc(),
                },
            )

    def test_deleted_cursor_raises_400(self, fake_db):
        """When the cursor document no longer exists, the service raises AppError 400."""
        self._seed_docs(fake_db, "t-1")

        with (
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
            pytest.raises(AppError) as exc_info,
        ):
            service.list_documents("t-1", cursor="doc-does-not-exist")

        assert exc_info.value.status_code == 400
        assert "cursor" in exc_info.value.error_code.lower() or "cursor" in exc_info.value.message.lower()

    def test_valid_cursor_paginates_correctly(self, fake_db):
        """A valid cursor returns the next page without error."""
        self._seed_docs(fake_db, "t-1", count=5)

        with patch("app.modules.knowledge.service.get_db", return_value=fake_db):
            first_page = service.list_documents("t-1", limit=2)

        assert first_page.next_cursor is not None, (
            "Expected a cursor since there are more documents"
        )

        with patch("app.modules.knowledge.service.get_db", return_value=fake_db):
            second_page = service.list_documents("t-1", limit=2, cursor=first_page.next_cursor)

        assert len(second_page.documents) > 0

    def test_cross_tenant_cursor_does_not_leak_data(self, fake_db):
        """A cursor from tenant B cannot expose tenant A's documents.

        Cross-tenant safety is structural: the cursor is looked up in the
        requesting tenant's own Firestore collection. A cursor from another
        tenant will not exist in this tenant's collection and raises 400.
        """
        self._seed_docs(fake_db, "tenant-a", count=3)
        self._seed_docs(fake_db, "tenant-b", count=3)

        # Get a valid cursor from tenant-a's listing.
        with patch("app.modules.knowledge.service.get_db", return_value=fake_db):
            page_a = service.list_documents("tenant-a", limit=1)

        tenant_a_cursor = page_a.next_cursor
        assert tenant_a_cursor is not None

        # Using tenant-a's cursor against tenant-b's listing must raise 400,
        # because tenant-b's collection does not contain that document ID.
        with (
            patch("app.modules.knowledge.service.get_db", return_value=fake_db),
            pytest.raises(AppError) as exc_info,
        ):
            service.list_documents("tenant-b", cursor=tenant_a_cursor)

        assert exc_info.value.status_code == 400
