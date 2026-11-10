"""Tests for email verification enforcement, resend-verification, and the
email_not_verified error path in the token gate."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.identity import service
from app.modules.identity.ports import verify_token
from app.modules.identity.schemas import ResendVerificationRequest


# ---------------------------------------------------------------------------
# verify_token — email_verified enforcement
# ---------------------------------------------------------------------------


@patch("app.modules.identity.ports.verify_id_token")
def test_verify_token_rejects_unverified_email(mock_verify):
    """verify_token must raise if email_verified is False."""
    mock_verify.return_value = {
        "uid": "uid-1",
        "email": "user@example.com",
        "role": "company_owner",
        "tenant_id": "tenant-a",
        "email_verified": False,
    }
    with pytest.raises(ValueError, match="email_not_verified"):
        verify_token("some-token")


@patch("app.modules.identity.ports.verify_id_token")
def test_verify_token_passes_verified_email(mock_verify):
    """verify_token must return claims when email_verified is True."""
    mock_verify.return_value = {
        "uid": "uid-1",
        "email": "user@example.com",
        "role": "company_owner",
        "tenant_id": "tenant-a",
        "email_verified": True,
        "name": "Alex",
    }
    claims = verify_token("some-token")
    assert claims["uid"] == "uid-1"
    assert claims["role"] == "company_owner"
    assert claims["name"] == "Alex"


# ---------------------------------------------------------------------------
# Registration — returns RegistrationPendingResponse (no token)
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.send_email_verification")
@patch("app.modules.identity.service.emit_tenant_registered")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_register_returns_pending_response_not_token(
    mock_init,
    mock_create_user,
    mock_set_claims,
    mock_get_db,
    mock_emit,
    mock_send_verification,
):
    """POST /register must return verification_required, never a token."""
    from app.modules.identity.schemas import RegisterRequest

    mock_create_user.return_value = SimpleNamespace(uid="new-uid")
    db = MagicMock()
    db.collection.return_value.document.return_value = MagicMock()
    mock_get_db.return_value = db

    payload = RegisterRequest(
        company_name="Acme",
        company_email="owner@acme.example",
        admin_name="Alice",
        password="strongpass123",
    )
    result = service.register_tenant(payload)

    assert result.status == "verification_required"
    assert str(result.email) == "owner@acme.example"
    assert not hasattr(result, "token"), "token must not be in registration response"

    # Verification email must be sent; sign_in_with_password must NOT be called.
    mock_send_verification.assert_called_once_with("owner@acme.example", "strongpass123")


# ---------------------------------------------------------------------------
# Resend verification — happy path
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.send_email_verification_via_custom_token")
@patch("app.modules.identity.service.auth.get_user_by_email")
@patch("app.modules.identity.service.init_firebase")
def test_resend_verification_sends_to_unverified_user(
    mock_init, mock_get_user, mock_send
):
    """Resend must call send_email_verification_via_custom_token for an unverified user."""
    mock_get_user.return_value = SimpleNamespace(uid="uid-unverified", email_verified=False)

    result = service.resend_verification(
        ResendVerificationRequest(email="user@example.com")
    )

    assert "verification" in result.message.lower() or "sent" in result.message.lower()
    mock_send.assert_called_once_with("uid-unverified")


@patch("app.modules.identity.service.send_email_verification_via_custom_token")
@patch("app.modules.identity.service.auth.get_user_by_email")
@patch("app.modules.identity.service.init_firebase")
def test_resend_verification_no_op_for_already_verified(
    mock_init, mock_get_user, mock_send
):
    """Resend must not send if the user is already verified."""
    mock_get_user.return_value = SimpleNamespace(uid="uid-v", email_verified=True)

    result = service.resend_verification(
        ResendVerificationRequest(email="verified@example.com")
    )

    assert result.message  # Always returns a message.
    mock_send.assert_not_called()


@patch("app.modules.identity.service.send_email_verification_via_custom_token")
@patch("app.modules.identity.service.init_firebase")
def test_resend_verification_unknown_email_returns_same_message(
    mock_init, mock_send
):
    """Resend must return the same message even if the email does not exist."""
    with patch("app.modules.identity.service.auth.get_user_by_email") as mock_get:

        class FakeNotFoundError(Exception):
            pass

        mock_get.side_effect = FakeNotFoundError("not found")

        with patch.object(service.auth, "UserNotFoundError", FakeNotFoundError):
            result = service.resend_verification(
                ResendVerificationRequest(email="ghost@example.com")
            )

    assert result.message
    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# Resend verification — rate limiting
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.send_email_verification_via_custom_token")
@patch("app.modules.identity.service.auth.get_user_by_email")
@patch("app.modules.identity.service.init_firebase")
def test_resend_verification_respects_cooldown(mock_init, mock_get_user, mock_send):
    """Second resend within 60 seconds must be suppressed."""
    mock_get_user.return_value = SimpleNamespace(uid="uid-cool", email_verified=False)
    email = "cooldown@example.com"

    # Prime the cooldown dict as if a send just happened.
    service._resend_cooldown[email] = datetime.now(UTC)

    result = service.resend_verification(
        ResendVerificationRequest(email=email)
    )

    assert result.message  # Same generic message returned.
    mock_send.assert_not_called()  # No second send within cooldown.

    # Cleanup cooldown dict so tests are isolated.
    del service._resend_cooldown[email]


@patch("app.modules.identity.service.send_email_verification_via_custom_token")
@patch("app.modules.identity.service.auth.get_user_by_email")
@patch("app.modules.identity.service.init_firebase")
def test_resend_verification_allows_after_cooldown_expires(
    mock_init, mock_get_user, mock_send
):
    """A resend is allowed once the 60-second cooldown has elapsed."""
    mock_get_user.return_value = SimpleNamespace(uid="uid-expired", email_verified=False)
    email = "expired@example.com"

    # Set last_sent to 61 seconds ago.
    service._resend_cooldown[email] = datetime.now(UTC) - timedelta(seconds=61)

    service.resend_verification(ResendVerificationRequest(email=email))

    mock_send.assert_called_once_with("uid-expired")

    # Cleanup.
    del service._resend_cooldown[email]
