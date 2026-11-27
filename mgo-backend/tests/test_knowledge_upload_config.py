"""WI-10: Upload size limit is config-driven (KNOWLEDGE_MAX_UPLOAD_MB setting).

Verifies:
- The upload endpoint reads the limit from settings, not a hardcoded constant.
- A file exactly at the limit is accepted.
- A file one byte over the limit returns 413.
"""

import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _auth_headers(fake_db, tenant_id="t-1"):
    """Seed a tenant+member record and return a fake owner auth token."""
    from tests.fake_firestore import subscription_doc

    fake_db.put(f"tenants/{tenant_id}", {"tenant_id": tenant_id, "widget_id": "w-1"})
    fake_db.put(
        f"tenants/{tenant_id}/members/uid-owner",
        {
            "uid": "uid-owner",
            "email": "owner@example.com",
            "name": "Owner",
            "role": "company_owner",
            "status": "active",
            "invited_by": None,
            "created_at": "2024-01-01T00:00:00+00:00",
        },
    )
    fake_db.put(f"subscriptions/{tenant_id}", subscription_doc(tenant_id))
    return {"Authorization": "Bearer fake-token"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestUploadSizeConfig:
    def test_file_at_limit_is_accepted(self, fake_db, monkeypatch):
        """A file exactly at KNOWLEDGE_MAX_UPLOAD_MB is not rejected for size."""
        monkeypatch.setattr(settings, "KNOWLEDGE_MAX_UPLOAD_MB", 1)

        file_bytes = b"%PDF-" + b"x" * (1 * 1024 * 1024 - 5)  # exactly 1 MB

        with (
            patch("app.shared.auth.get_token_verifier") as mock_tv,
            patch("app.modules.knowledge.service.billing_ports.is_subscription_active", return_value=True),
            patch("app.modules.knowledge.service.billing_ports.is_within_plan_limit", return_value=True),
            patch("app.modules.knowledge.service.gcs.upload_file"),
            patch("app.modules.knowledge.service.gcs.delete_file"),
            patch("app.modules.knowledge.tasks.enqueue_document_task", return_value=True),
        ):
            mock_tv.return_value = lambda token: {
                "uid": "uid-owner",
                "tenant_id": "t-1",
                "role": "company_owner",
                "email_verified": True,
            }
            headers = _auth_headers(fake_db)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/knowledge/t-1/documents",
                files={"file": ("report.pdf", io.BytesIO(file_bytes), "application/pdf")},
                headers=headers,
            )

        # Should not be a 413.
        assert resp.status_code != 413, f"Got 413 for file at limit: {resp.json()}"

    def test_file_over_limit_returns_413(self, fake_db, monkeypatch):
        """A file one byte over KNOWLEDGE_MAX_UPLOAD_MB returns 413."""
        monkeypatch.setattr(settings, "KNOWLEDGE_MAX_UPLOAD_MB", 1)

        # 1 MB + 1 byte of valid PDF content.
        file_bytes = b"%PDF-" + b"x" * (1 * 1024 * 1024 - 4)  # 1 MB + 1 byte

        with (
            patch("app.shared.auth.get_token_verifier") as mock_tv,
            patch("app.modules.knowledge.service.billing_ports.is_subscription_active", return_value=True),
            patch("app.modules.knowledge.service.billing_ports.is_within_plan_limit", return_value=True),
        ):
            mock_tv.return_value = lambda token: {
                "uid": "uid-owner",
                "tenant_id": "t-1",
                "role": "company_owner",
                "email_verified": True,
            }
            _auth_headers(fake_db)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/knowledge/t-1/documents",
                files={"file": ("report.pdf", io.BytesIO(file_bytes), "application/pdf")},
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 413
        body = resp.json()
        assert body["error"]["code"] == "file_too_large"

    def test_limit_message_matches_setting(self, fake_db, monkeypatch):
        """The 413 error message reports the value from KNOWLEDGE_MAX_UPLOAD_MB."""
        monkeypatch.setattr(settings, "KNOWLEDGE_MAX_UPLOAD_MB", 5)

        file_bytes = b"%PDF-" + b"x" * (5 * 1024 * 1024)  # 5 MB + 5 bytes → over

        with (
            patch("app.shared.auth.get_token_verifier") as mock_tv,
            patch("app.modules.knowledge.service.billing_ports.is_subscription_active", return_value=True),
            patch("app.modules.knowledge.service.billing_ports.is_within_plan_limit", return_value=True),
        ):
            mock_tv.return_value = lambda token: {
                "uid": "uid-owner",
                "tenant_id": "t-1",
                "role": "company_owner",
                "email_verified": True,
            }
            _auth_headers(fake_db)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/v1/knowledge/t-1/documents",
                files={"file": ("report.pdf", io.BytesIO(file_bytes), "application/pdf")},
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 413
        # Message must mention 5 MB, not a hardcoded 20.
        assert "5" in resp.json()["error"]["message"]
        assert "20" not in resp.json()["error"]["message"]
