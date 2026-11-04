"""Tests for login — error mapping, rate-limiting, and status-flip on first login."""

from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.identity import service
from app.modules.identity.schemas import LoginRequest


@pytest.fixture
def login_payload():
    return LoginRequest(email="user@example.com", password="password123")


def _make_claims(role="company_owner", tenant_id="t1", uid="uid1"):
    return {
        "uid": uid,
        "email": "user@example.com",
        "role": role,
        "tenant_id": tenant_id,
    }


def _make_active_tenant_db():
    """Return a Firestore mock with an active tenant document."""
    tenant_data = {"status": "active"}
    tenant_doc = MagicMock()
    tenant_doc.exists = True
    tenant_doc.to_dict.return_value = tenant_data

    member_doc = MagicMock()
    member_doc.exists = False  # no member doc by default

    member_ref = MagicMock()
    member_ref.get.return_value = member_doc

    members_col = MagicMock()
    members_col.document.return_value = member_ref

    tenant_ref = MagicMock()
    tenant_ref.get.return_value = tenant_doc
    tenant_ref.collection.return_value = members_col

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref

    db = MagicMock()
    db.collection.return_value = tenants_col
    return db, member_ref


# ---------------------------------------------------------------------------
# Successful login
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.verify_token")
@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.init_firebase")
def test_login_success_returns_auth_result(
    mock_init,
    mock_signin,
    mock_verify,
    mock_get_db,
    login_payload,
):
    mock_signin.return_value = {"idToken": "real-token"}
    mock_verify.return_value = _make_claims()
    db, _ = _make_active_tenant_db()
    mock_get_db.return_value = db

    result = service.login(login_payload)

    assert result.token == "real-token"
    assert result.role == "company_owner"
    assert result.tenant_id == "t1"


# ---------------------------------------------------------------------------
# Error mapping — Firebase codes must never reach the caller
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.init_firebase")
def test_login_invalid_credentials_returns_generic_message(
    mock_init,
    mock_signin,
    login_payload,
):
    """Firebase's INVALID_PASSWORD code must NOT appear in the response."""
    mock_signin.side_effect = ValueError("Firebase sign-in failed: INVALID_PASSWORD")

    with pytest.raises(AppError) as exc_info:
        service.login(login_payload)

    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "invalid_credentials"
    # The generic message must not leak the Firebase error code.
    assert "INVALID_PASSWORD" not in exc_info.value.message
    assert "Invalid email or password" in exc_info.value.message


@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.init_firebase")
def test_login_rate_limited_returns_429(mock_init, mock_signin, login_payload):
    """Firebase TOO_MANY_ATTEMPTS_TRY_LATER must map to 429 too_many_attempts."""
    mock_signin.side_effect = ValueError(
        "Firebase sign-in failed: TOO_MANY_ATTEMPTS_TRY_LATER"
    )

    with pytest.raises(AppError) as exc_info:
        service.login(login_payload)

    assert exc_info.value.status_code == 429
    assert exc_info.value.code == "too_many_attempts"


# ---------------------------------------------------------------------------
# No-role token must be rejected
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.verify_token")
@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.init_firebase")
def test_login_no_role_claim_rejected(
    mock_init,
    mock_signin,
    mock_verify,
    login_payload,
):
    """A token with no role claim must be rejected with 403."""
    mock_signin.return_value = {"idToken": "tok"}
    mock_verify.return_value = {
        "uid": "uid1",
        "email": "user@example.com",
        "role": None,
        "tenant_id": None,
    }

    with pytest.raises(AppError) as exc_info:
        service.login(login_payload)

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "permission_denied"


# ---------------------------------------------------------------------------
# Invited member status flip on first login
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.verify_token")
@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.init_firebase")
def test_login_flips_invited_member_to_active(
    mock_init,
    mock_signin,
    mock_verify,
    mock_get_db,
    login_payload,
):
    """An invited member's status must be set to 'active' on their first successful login."""
    mock_signin.return_value = {"idToken": "tok"}
    mock_verify.return_value = _make_claims(role="company_admin", uid="invited-uid")

    # Simulate a member doc with status "invited".
    member_doc = MagicMock()
    member_doc.exists = True
    member_doc.to_dict.return_value = {"status": "invited"}

    member_ref = MagicMock()
    member_ref.get.return_value = member_doc

    members_col = MagicMock()
    members_col.document.return_value = member_ref

    tenant_doc = MagicMock()
    tenant_doc.exists = True
    tenant_doc.to_dict.return_value = {"status": "active"}

    tenant_ref = MagicMock()
    tenant_ref.get.return_value = tenant_doc
    tenant_ref.collection.return_value = members_col

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref

    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    service.login(login_payload)

    # The member ref must have been updated to active.
    member_ref.update.assert_called_once_with({"status": "active"})


# ---------------------------------------------------------------------------
# Inactive tenant blocked at login
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.verify_token")
@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.init_firebase")
def test_login_inactive_tenant_returns_403(
    mock_init,
    mock_signin,
    mock_verify,
    mock_get_db,
    login_payload,
):
    mock_signin.return_value = {"idToken": "tok"}
    mock_verify.return_value = _make_claims()

    tenant_doc = MagicMock()
    tenant_doc.exists = True
    tenant_doc.to_dict.return_value = {"status": "suspended"}

    tenant_ref = MagicMock()
    tenant_ref.get.return_value = tenant_doc

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref

    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    with pytest.raises(AppError) as exc_info:
        service.login(login_payload)

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "subscription_inactive"
