"""Invited users and platform admins must be able to log in.

The login tests run the REAL verify_token (only Firebase network calls are
patched), because mocking verify_token is exactly what hid the original bug:
accounts created without email_verified=True were rejected by the
verification gate and the endpoint returned 500.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.identity import service
from app.modules.identity.schemas import InviteRequest, PlatformAdminRequest
from tests.fake_firestore import FakeDB

LOGIN_URL = "/api/v1/identity/login"


# ---------------------------------------------------------------------------
# Accounts created by invite / platform-admin creation are pre-verified
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.send_password_reset_email")
@patch("app.modules.identity.service.get_firestore_client", return_value=MagicMock())
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_invited_user_is_created_email_verified(
    mock_init, mock_create, mock_claims, mock_db, mock_reset
):
    mock_create.return_value = SimpleNamespace(uid="new-uid")
    service.invite_user(
        tenant_id="tenant-a",
        payload=InviteRequest(
            email="newmember@example.com", role="company_member", name="New Member"
        ),
        invited_by_uid="owner-uid",
    )
    assert mock_create.call_args.kwargs["email_verified"] is True


@patch("app.modules.identity.service.send_password_reset_email")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_platform_admin_is_created_email_verified(
    mock_init, mock_create, mock_claims, mock_reset
):
    mock_create.return_value = SimpleNamespace(uid="padmin-uid")
    service.create_platform_admin(
        PlatformAdminRequest(email="padmin@platform.example", name="P Admin")
    )
    assert mock_create.call_args.kwargs["email_verified"] is True


# ---------------------------------------------------------------------------
# Login with the real verification gate
# ---------------------------------------------------------------------------


@pytest.fixture
def login_env():
    """Patch only Firebase's network edges; keep verify_token real."""
    db = FakeDB()
    db.put("tenants/t-1", {"name": "Acme", "status": "active"})
    db.put("tenants/t-1/members/u1", {"status": "invited", "role": "company_admin"})
    service._resend_cooldown.clear()
    claims = {
        "uid": "u1",
        "email": "invitee@acme.com",
        "role": "company_admin",
        "tenant_id": "t-1",
        "email_verified": True,
    }
    state = SimpleNamespace(db=db, claims=claims)
    with (
        patch("app.modules.identity.service.init_firebase"),
        patch(
            "app.modules.identity.service.sign_in_with_password",
            return_value={"idToken": "tok", "localId": "u1"},
        ),
        patch(
            "app.modules.identity.ports.verify_id_token",
            side_effect=lambda token: state.claims,
        ),
        patch("app.modules.identity.service.get_firestore_client", return_value=db),
        patch("app.modules.identity.service.send_email_verification") as resend,
    ):
        state.resend = resend
        yield state
    service._resend_cooldown.clear()


def post_login(password="abcd1234"):
    return TestClient(app).post(
        LOGIN_URL, json={"email": "invitee@acme.com", "password": password}
    )


def test_invited_user_can_log_in_and_becomes_active(login_env):
    resp = post_login()
    assert resp.status_code == 200
    assert resp.json()["data"]["role"] == "company_admin"
    assert login_env.db.doc("tenants/t-1/members/u1")["status"] == "active"


def test_login_accepts_a_six_character_password(login_env):
    """Firebase's hosted set-password page allows 6 characters."""
    assert post_login(password="abc123").status_code == 200


def test_unverified_account_gets_403_and_a_fresh_verification_email(login_env):
    login_env.claims = {**login_env.claims, "email_verified": False}
    resp = post_login()
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "email_not_verified"
    login_env.resend.assert_called_once_with("invitee@acme.com", "abcd1234")


def test_repeated_unverified_logins_do_not_spam_the_inbox(login_env):
    login_env.claims = {**login_env.claims, "email_verified": False}
    post_login()
    post_login()
    assert login_env.resend.call_count == 1  # second attempt is inside the cooldown


def test_resend_failure_still_returns_403_not_500(login_env):
    login_env.claims = {**login_env.claims, "email_verified": False}
    login_env.resend.side_effect = RuntimeError("email service down")
    resp = post_login()
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "email_not_verified"


def test_invalid_token_returns_401_not_500(login_env):
    with patch(
        "app.modules.identity.ports.verify_id_token",
        side_effect=ValueError("token expired"),
    ):
        resp = post_login()
    assert resp.status_code in (401, 403)
    assert resp.status_code != 500

