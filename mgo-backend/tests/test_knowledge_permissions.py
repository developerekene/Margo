"""Integration tests for knowledge API endpoints — permissions and auth.

Uses FastAPI TestClient. Token verification is mocked so no Firebase calls
happen. GCS and Cloud Tasks are also mocked.

Covers:
  - Public endpoints: 401 on missing/bad token, 403 on wrong role or tenant
  - Internal endpoints: 403 on missing/invalid OIDC token
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role="company_owner", tenant_id="t-1", uid="u-1"):
    return {
        "uid": uid,
        "email": "owner@example.com",
        "role": role,
        "tenant_id": tenant_id,
        "name": "Test User",
    }


def _bearer(token="valid-token"):
    return {"Authorization": f"Bearer {token}"}


client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Public endpoint auth — using the crawl status endpoint as a representative
# GET /{tenant_id}/crawl/{job_id}
# ---------------------------------------------------------------------------


class TestPublicEndpointAuth:
    _url = "/api/v1/knowledge/t-1/crawl/job-1"

    def test_missing_auth_header_returns_401(self):
        response = client.get(self._url)
        # FastAPI returns 422 when a required Header(...) is absent entirely;
        # either way auth has not passed.
        assert response.status_code in (401, 422)

    def test_malformed_auth_header_returns_401(self):
        response = client.get(self._url, headers={"Authorization": "Token bad"})
        assert response.status_code == 401

    def test_invalid_token_returns_401(self):
        with patch(
            "app.shared.auth.get_token_verifier",
            return_value=MagicMock(side_effect=Exception("bad token")),
        ):
            response = client.get(self._url, headers=_bearer("bad"))
        assert response.status_code == 401

    def test_wrong_role_returns_403(self, fake_db):
        user = _make_user(role="company_member")
        with patch(
            "app.shared.auth.get_token_verifier",
            return_value=MagicMock(
                return_value={**user, "email_verified": True}
            ),
        ):
            response = client.get(self._url, headers=_bearer())
        assert response.status_code == 403

    def test_wrong_tenant_returns_403(self, fake_db):
        user = _make_user(role="company_owner", tenant_id="t-OTHER")
        with patch(
            "app.shared.auth.get_token_verifier",
            return_value=MagicMock(
                return_value={**user, "email_verified": True}
            ),
        ):
            response = client.get(self._url, headers=_bearer())
        assert response.status_code == 403

    def test_valid_owner_returns_non_401_non_403(self, fake_db):
        """A valid owner token passes auth (may get 404 for missing job — that's OK)."""
        user = _make_user(role="company_owner", tenant_id="t-1")
        with patch(
            "app.shared.auth.get_token_verifier",
            return_value=MagicMock(
                return_value={**user, "email_verified": True}
            ),
        ):
            response = client.get(self._url, headers=_bearer())
        # Auth passes; endpoint may 404 on missing crawl job
        assert response.status_code not in (401, 403)

    def test_valid_admin_returns_non_401_non_403(self, fake_db):
        user = _make_user(role="company_admin", tenant_id="t-1")
        with patch(
            "app.shared.auth.get_token_verifier",
            return_value=MagicMock(
                return_value={**user, "email_verified": True}
            ),
        ):
            response = client.get(self._url, headers=_bearer())
        assert response.status_code not in (401, 403)


# ---------------------------------------------------------------------------
# Internal endpoint auth — /internal/process-page
# ---------------------------------------------------------------------------


class TestInternalEndpointAuth:
    _url = "/api/v1/knowledge/internal/process-page"
    _payload = {
        "tenant_id": "t-1",
        "job_id": "job-1",
        "page_id": "pg-1",
        "url": "https://example.com",
    }

    def test_missing_authorization_header_returns_422_or_403(self):
        """FastAPI returns 422 for a missing required header (defined as Header(...))."""
        response = client.post(self._url, json=self._payload)
        assert response.status_code in (422, 403)

    def test_non_bearer_format_returns_403(self):
        response = client.post(
            self._url,
            json=self._payload,
            headers={"Authorization": "Token badtoken"},
        )
        assert response.status_code == 403

    def test_invalid_oidc_token_returns_403(self, fake_db):
        with patch(
            "app.modules.knowledge.permissions.verify_cloud_tasks_token",
            side_effect=__import__(
                "app.modules.knowledge.oidc", fromlist=["OIDCVerificationError"]
            ).OIDCVerificationError("bad token"),
        ):
            response = client.post(
                self._url,
                json=self._payload,
                headers={"Authorization": "Bearer invalid.token"},
            )
        assert response.status_code == 403

    def test_valid_oidc_token_allows_through(self, fake_db):
        """With a valid OIDC token the handler is reached (may 200 idempotently)."""
        good_claims = {
            "email": "tasks@project.iam.gserviceaccount.com",
            "email_verified": True,
        }
        with (
            patch(
                "app.modules.knowledge.permissions.verify_cloud_tasks_token",
                return_value=good_claims,
            ),
            # Also mock out the actual service call so we don't need GCS/tasks
            patch("app.modules.knowledge.service.process_page"),
        ):
            response = client.post(
                self._url,
                json=self._payload,
                headers={"Authorization": "Bearer valid.oidc.token"},
            )
        assert response.status_code == 200


class TestInternalProcessDocumentAuth:
    _url = "/api/v1/knowledge/internal/process-document"
    _payload = {
        "tenant_id": "t-1",
        "document_id": "doc-1",
        "storage_object": "tenants/t-1/documents/doc-1/original",
    }

    def test_non_bearer_format_returns_403(self):
        response = client.post(
            self._url,
            json=self._payload,
            headers={"Authorization": "Token badtoken"},
        )
        assert response.status_code == 403

    def test_valid_oidc_token_allows_through(self, fake_db):
        good_claims = {"email": "tasks@proj.iam.gserviceaccount.com", "email_verified": True}
        with (
            patch(
                "app.modules.knowledge.permissions.verify_cloud_tasks_token",
                return_value=good_claims,
            ),
            patch("app.modules.knowledge.service.process_document"),
        ):
            response = client.post(
                self._url,
                json=self._payload,
                headers={"Authorization": "Bearer valid.oidc.token"},
            )
        assert response.status_code == 200
