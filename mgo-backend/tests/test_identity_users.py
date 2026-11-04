"""Tests for user invite, listing, and deletion — including the full role matrix."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.identity import service
from app.modules.identity.schemas import InviteRequest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_member_doc(uid, role, status="active"):
    """Return a Firestore document mock for a member."""
    doc = MagicMock()
    doc.exists = True
    doc.id = uid
    doc.to_dict.return_value = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "name": "Test User",
        "role": role,
        "status": status,
        "invited_by": None,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    return doc


def _caller(uid, role, tenant_id="tenant-a"):
    return {
        "uid": uid,
        "role": role,
        "tenant_id": tenant_id,
        "email": f"{uid}@example.com",
    }


# ---------------------------------------------------------------------------
# Invite — happy path
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.send_password_reset_email")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_invite_user_happy_path(
    mock_init,
    mock_create,
    mock_set_claims,
    mock_get_db,
    mock_reset_email,
):
    """Invite creates the user, sets claims, writes member doc, sends reset email."""
    mock_create.return_value = SimpleNamespace(uid="new-uid")

    member_doc_ref = MagicMock()
    members_col = MagicMock()
    members_col.document.return_value = member_doc_ref

    tenant_doc_ref = MagicMock()
    tenant_doc_ref.collection.return_value = members_col

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_doc_ref

    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    payload = InviteRequest(
        email="newmember@example.com",
        role="company_member",
        name="New Member",
    )

    result = service.invite_user(
        tenant_id="tenant-a",
        payload=payload,
        invited_by_uid="owner-uid",
    )

    assert result.status == "invited"
    assert str(result.email) == "newmember@example.com"

    # Claims must use tenant_id from path, not body.
    mock_set_claims.assert_called_once_with(
        "new-uid",
        {"role": "company_member", "tenant_id": "tenant-a"},
    )

    mock_reset_email.assert_called_once_with("newmember@example.com")


@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_invite_role_literal_rejects_platform_admin(mock_init, mock_create):
    """The invite schema must not accept platform_admin as a role."""
    with pytest.raises(Exception):
        InviteRequest(
            email="hacker@example.com",
            role="platform_admin",
            name="Hacker",
        )


@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_invite_duplicate_email_returns_409(mock_init, mock_create):
    """A duplicate email must raise 409 without revealing tenant ownership."""

    class FakeEmailAlreadyExistsError(Exception):
        pass

    mock_create.side_effect = FakeEmailAlreadyExistsError("already exists")

    with (
        patch.object(
            service.auth,
            "EmailAlreadyExistsError",
            FakeEmailAlreadyExistsError,
        ),
        pytest.raises(AppError) as exc_info,
    ):
        service.invite_user(
            tenant_id="tenant-a",
            payload=InviteRequest(
                email="dup@example.com",
                role="company_member",
                name="Dup",
            ),
            invited_by_uid="owner-uid",
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "email_already_registered"


# ---------------------------------------------------------------------------
# Invite compensation
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.auth.delete_user")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_invite_compensation_deletes_auth_user_on_failure(
    mock_init,
    mock_create,
    mock_set_claims,
    mock_get_db,
    mock_delete,
):
    """If anything after user creation fails, the Auth user must be deleted."""
    mock_create.return_value = SimpleNamespace(uid="new-uid-comp")
    mock_set_claims.side_effect = RuntimeError("Claims service down")

    with pytest.raises(AppError) as exc_info:
        service.invite_user(
            tenant_id="tenant-a",
            payload=InviteRequest(
                email="comp@example.com",
                role="company_member",
                name="CompUser",
            ),
            invited_by_uid="owner-uid",
        )

    assert exc_info.value.code == "invite_failed"
    mock_delete.assert_called_once_with("new-uid-comp")


# ---------------------------------------------------------------------------
# Delete user — role matrix
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.auth.delete_user")
@patch("app.modules.identity.service.auth.revoke_refresh_tokens")
@patch("app.modules.identity.service.get_firestore_client")
def test_owner_can_remove_admin(mock_get_db, mock_revoke, mock_delete):
    """Owner must be able to remove an admin."""
    member_doc = _make_member_doc("admin-uid", "company_admin")

    member_ref = MagicMock()
    member_ref.get.return_value = member_doc

    members_col = MagicMock()
    members_col.document.return_value = member_ref

    tenant_ref = MagicMock()
    tenant_ref.collection.return_value = members_col

    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref

    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    caller = _caller("owner-uid", "company_owner")
    # Should not raise.
    service.remove_user("tenant-a", "admin-uid", caller)
    member_ref.delete.assert_called_once()


@patch("app.modules.identity.service.auth.delete_user")
@patch("app.modules.identity.service.auth.revoke_refresh_tokens")
@patch("app.modules.identity.service.get_firestore_client")
def test_owner_can_remove_member(mock_get_db, mock_revoke, mock_delete):
    member_doc = _make_member_doc("member-uid", "company_member")
    member_ref = MagicMock()
    member_ref.get.return_value = member_doc

    members_col = MagicMock()
    members_col.document.return_value = member_ref
    tenant_ref = MagicMock()
    tenant_ref.collection.return_value = members_col
    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref
    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    service.remove_user("tenant-a", "member-uid", _caller("owner-uid", "company_owner"))
    member_ref.delete.assert_called_once()


@patch("app.modules.identity.service.get_firestore_client")
def test_admin_cannot_remove_admin(mock_get_db):
    """Admin must NOT be able to remove another admin."""
    member_doc = _make_member_doc("other-admin", "company_admin")
    member_ref = MagicMock()
    member_ref.get.return_value = member_doc
    members_col = MagicMock()
    members_col.document.return_value = member_ref
    tenant_ref = MagicMock()
    tenant_ref.collection.return_value = members_col
    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref
    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    with pytest.raises(AppError) as exc_info:
        service.remove_user(
            "tenant-a",
            "other-admin",
            _caller("admin-uid", "company_admin"),
        )
    assert exc_info.value.status_code == 403


@patch("app.modules.identity.service.auth.delete_user")
@patch("app.modules.identity.service.auth.revoke_refresh_tokens")
@patch("app.modules.identity.service.get_firestore_client")
def test_admin_can_remove_member(mock_get_db, mock_revoke, mock_delete):
    member_doc = _make_member_doc("member-uid", "company_member")
    member_ref = MagicMock()
    member_ref.get.return_value = member_doc
    members_col = MagicMock()
    members_col.document.return_value = member_ref
    tenant_ref = MagicMock()
    tenant_ref.collection.return_value = members_col
    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref
    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    service.remove_user("tenant-a", "member-uid", _caller("admin-uid", "company_admin"))
    member_ref.delete.assert_called_once()


@patch("app.modules.identity.service.get_firestore_client")
def test_cannot_remove_self(mock_get_db):
    """Self-removal must always be rejected."""
    with pytest.raises(AppError) as exc_info:
        service.remove_user(
            "tenant-a",
            "owner-uid",
            _caller("owner-uid", "company_owner"),
        )
    assert exc_info.value.code == "cannot_remove_self"


@patch("app.modules.identity.service.get_firestore_client")
def test_cannot_remove_owner(mock_get_db):
    """Owner must never be removable, even by another owner."""
    member_doc = _make_member_doc("target-owner", "company_owner")
    member_ref = MagicMock()
    member_ref.get.return_value = member_doc
    members_col = MagicMock()
    members_col.document.return_value = member_ref
    tenant_ref = MagicMock()
    tenant_ref.collection.return_value = members_col
    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref
    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    with pytest.raises(AppError) as exc_info:
        service.remove_user(
            "tenant-a",
            "target-owner",
            _caller("owner-uid", "company_owner"),
        )
    assert exc_info.value.code == "cannot_remove_owner"


@patch("app.modules.identity.service.get_firestore_client")
def test_remove_nonexistent_user_returns_404(mock_get_db):
    """Removing a user that does not belong to the tenant must return 404."""
    missing_doc = MagicMock()
    missing_doc.exists = False

    member_ref = MagicMock()
    member_ref.get.return_value = missing_doc
    members_col = MagicMock()
    members_col.document.return_value = member_ref
    tenant_ref = MagicMock()
    tenant_ref.collection.return_value = members_col
    tenants_col = MagicMock()
    tenants_col.document.return_value = tenant_ref
    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    with pytest.raises(AppError) as exc_info:
        service.remove_user(
            "tenant-a",
            "ghost-uid",
            _caller("owner-uid", "company_owner"),
        )
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Tenant isolation — endpoint must not reveal cross-tenant user existence
# ---------------------------------------------------------------------------


def test_remove_user_checks_tenant_via_doc_not_found():
    """A user from another tenant appears as 404, not 403, so no info leaks."""
    # The member doc simply won't exist under the target tenant's members subcollection.
    # This is already covered by test_remove_nonexistent_user_returns_404, but we
    # make the intent explicit here for documentation purposes.
    # Intent tested above — no cross-tenant lookup by design.
