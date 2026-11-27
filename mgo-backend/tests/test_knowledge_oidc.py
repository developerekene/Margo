"""Unit tests for knowledge.oidc — OIDC token verification.

All tests mock google.oauth2.id_token.verify_oauth2_token so no network or
real credentials are needed.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.modules.knowledge.oidc import OIDCVerificationError, verify_cloud_tasks_token

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_AUDIENCE = "https://api.example.com"
_SA_EMAIL = "tasks@project.iam.gserviceaccount.com"
_GOOD_CLAIMS = {
    "email": _SA_EMAIL,
    "email_verified": True,
    "sub": "12345",
    "aud": _AUDIENCE,
}


def _patch_settings(**overrides):
    """Patch settings with sane defaults, allowing per-test overrides."""
    defaults = {
        "KNOWLEDGE_OIDC_AUDIENCE": _AUDIENCE,
        "KNOWLEDGE_TASK_SA_EMAIL": _SA_EMAIL,
    }
    defaults.update(overrides)
    return patch("app.modules.knowledge.oidc.settings", **{k: v for k, v in defaults.items()})


# ---------------------------------------------------------------------------
# Configuration-level failures (checked before touching the token)
# ---------------------------------------------------------------------------


def test_raises_when_audience_not_configured():
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = ""
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = _SA_EMAIL
        with pytest.raises(OIDCVerificationError, match="KNOWLEDGE_OIDC_AUDIENCE"):
            verify_cloud_tasks_token("some.token.value")


def test_raises_when_sa_email_not_configured():
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = _AUDIENCE
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = ""
        with pytest.raises(OIDCVerificationError, match="KNOWLEDGE_TASK_SA_EMAIL"):
            verify_cloud_tasks_token("some.token.value")


# ---------------------------------------------------------------------------
# Token-level failures
# ---------------------------------------------------------------------------


def test_raises_on_missing_token():
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = _AUDIENCE
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = _SA_EMAIL
        with pytest.raises(OIDCVerificationError, match="Missing OIDC token"):
            verify_cloud_tasks_token("")


def test_raises_when_google_auth_raises(monkeypatch):
    """google.oauth2.id_token.verify_oauth2_token raising → OIDCVerificationError."""
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = _AUDIENCE
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = _SA_EMAIL

        with (
            patch("google.auth.transport.requests.Request", MagicMock()),
            patch(
                "google.oauth2.id_token.verify_oauth2_token",
                side_effect=ValueError("token expired"),
            ),pytest.raises(OIDCVerificationError, match="Token verification failed")
        ):
            verify_cloud_tasks_token("bad.token")


def test_raises_on_wrong_email():
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = _AUDIENCE
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = _SA_EMAIL

        wrong_claims = {**_GOOD_CLAIMS, "email": "attacker@evil.com"}
        with (
            patch("google.auth.transport.requests.Request", MagicMock()),
            patch(
                "google.oauth2.id_token.verify_oauth2_token",
                return_value=wrong_claims,
            ),pytest.raises(OIDCVerificationError, match="email")
        ):
            verify_cloud_tasks_token("some.token")


def test_raises_when_email_verified_false():
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = _AUDIENCE
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = _SA_EMAIL

        unverified_claims = {**_GOOD_CLAIMS, "email_verified": False}
        with (
            patch("google.auth.transport.requests.Request", MagicMock()),
            patch(
                "google.oauth2.id_token.verify_oauth2_token",
                return_value=unverified_claims,
            ),pytest.raises(OIDCVerificationError, match="email_verified")
        ):
            verify_cloud_tasks_token("some.token")


# ---------------------------------------------------------------------------
# Success path
# ---------------------------------------------------------------------------


def test_returns_claims_on_valid_token():
    with patch("app.modules.knowledge.oidc.settings") as mock_settings:
        mock_settings.KNOWLEDGE_OIDC_AUDIENCE = _AUDIENCE
        mock_settings.KNOWLEDGE_TASK_SA_EMAIL = _SA_EMAIL

        with (
            patch("google.auth.transport.requests.Request", MagicMock()),
            patch(
                "google.oauth2.id_token.verify_oauth2_token",
                return_value=_GOOD_CLAIMS,
            ),
        ):
            claims = verify_cloud_tasks_token("valid.token.here")

    assert claims["email"] == _SA_EMAIL
    assert claims["email_verified"] is True
