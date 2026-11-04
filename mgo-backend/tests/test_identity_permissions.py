"""Tests for token verification and permission dependencies."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.modules.identity.permissions import (
    get_current_user,
    require_role,
    require_tenant_access,
)

# ---------------------------------------------------------------------------
# get_current_user
# ---------------------------------------------------------------------------


def test_missing_bearer_prefix_rejected():
    """Tokens without 'Bearer ' prefix must return 401."""
    with pytest.raises(HTTPException) as exc:
        get_current_user(authorization="not-a-bearer-token")
    assert exc.value.status_code == 401


@patch("app.modules.identity.permissions.verify_token")
def test_valid_token_returns_claims(mock_verify):
    """A valid token with a role returns the claims dict."""
    mock_verify.return_value = {
        "uid": "abc",
        "role": "company_owner",
        "tenant_id": "t1",
        "email": "owner@t1.example",
    }
    result = get_current_user(authorization="Bearer faketoken123")
    assert result["role"] == "company_owner"


@patch("app.modules.identity.permissions.verify_token")
def test_token_with_no_role_claim_rejected(mock_verify):
    """A valid Firebase token that has no role claim must return 403."""
    mock_verify.return_value = {
        "uid": "abc",
        "role": None,
        "tenant_id": None,
        "email": "norole@example.com",
    }
    with pytest.raises(HTTPException) as exc:
        get_current_user(authorization="Bearer faketoken123")
    assert exc.value.status_code == 403


@patch("app.modules.identity.permissions.verify_token")
def test_invalid_token_raises_401(mock_verify):
    """A token that verify_token rejects must return 401."""
    mock_verify.side_effect = ValueError("Token expired")
    with pytest.raises(HTTPException) as exc:
        get_current_user(authorization="Bearer badtoken")
    assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# require_role
# ---------------------------------------------------------------------------


@patch("app.modules.identity.permissions.verify_token")
def test_require_role_rejects_wrong_role(mock_verify):
    """require_role must return 403 when the caller's role is not in the allowed list."""
    mock_verify.return_value = {
        "uid": "abc",
        "role": "company_member",
        "tenant_id": "t1",
        "email": "member@t1.example",
    }
    check = require_role(["company_owner", "company_admin"])
    with pytest.raises(HTTPException) as exc:
        check(user=get_current_user(authorization="Bearer faketoken123"))
    assert exc.value.status_code == 403


@patch("app.modules.identity.permissions.verify_token")
def test_require_role_allows_correct_role(mock_verify):
    """require_role must pass through when the caller's role is in the allowed list."""
    mock_verify.return_value = {
        "uid": "abc",
        "role": "company_owner",
        "tenant_id": "t1",
        "email": "owner@t1.example",
    }
    check = require_role(["company_owner", "company_admin"])
    result = check(user=get_current_user(authorization="Bearer faketoken123"))
    assert result["role"] == "company_owner"


# ---------------------------------------------------------------------------
# require_tenant_access
# ---------------------------------------------------------------------------


@patch("app.modules.identity.permissions.verify_token")
def test_require_tenant_access_rejects_wrong_tenant(mock_verify):
    """A caller whose tenant_id does not match the path tenant_id gets 403."""
    mock_verify.return_value = {
        "uid": "uid1",
        "role": "company_owner",
        "tenant_id": "tenant-a",
        "email": "owner@a.example",
    }
    dep = require_tenant_access(roles=["company_owner"])
    check = dep
    with pytest.raises(HTTPException) as exc:
        check(
            tenant_id="tenant-b",
            user=get_current_user(authorization="Bearer token"),
        )
    assert exc.value.status_code == 403


@patch("app.modules.identity.permissions.verify_token")
def test_require_tenant_access_allows_own_tenant(mock_verify):
    """An owner accessing their own tenant passes the dependency."""
    mock_verify.return_value = {
        "uid": "uid1",
        "role": "company_owner",
        "tenant_id": "tenant-a",
        "email": "owner@a.example",
    }
    dep = require_tenant_access(roles=["company_owner"])
    result = dep(
        tenant_id="tenant-a",
        user=get_current_user(authorization="Bearer token"),
    )
    assert result["tenant_id"] == "tenant-a"


@patch("app.modules.identity.permissions.verify_token")
def test_require_tenant_access_platform_admin_bypasses_tenant(mock_verify):
    """A platform_admin can access any tenant when allow_platform_admin=True."""
    mock_verify.return_value = {
        "uid": "uid-padmin",
        "role": "platform_admin",
        "tenant_id": None,
        "email": "admin@platform.example",
    }
    dep = require_tenant_access(
        roles=["company_owner"],
        allow_platform_admin=True,
    )
    result = dep(
        tenant_id="some-other-tenant",
        user=get_current_user(authorization="Bearer token"),
    )
    assert result["role"] == "platform_admin"


@patch("app.modules.identity.permissions.verify_token")
def test_require_tenant_access_platform_admin_blocked_without_flag(mock_verify):
    """A platform_admin must NOT bypass tenant check when allow_platform_admin=False."""
    mock_verify.return_value = {
        "uid": "uid-padmin",
        "role": "platform_admin",
        "tenant_id": None,
        "email": "admin@platform.example",
    }
    dep = require_tenant_access(
        roles=["company_owner"],
        allow_platform_admin=False,
    )
    with pytest.raises(HTTPException) as exc:
        dep(
            tenant_id="some-tenant",
            user=get_current_user(authorization="Bearer token"),
        )
    assert exc.value.status_code == 403
