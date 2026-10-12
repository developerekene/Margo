"""Tests for platform-admin-only endpoints: GET /tenants and POST /platform-admins."""

from datetime import UTC
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.identity import service
from app.modules.identity.schemas import PlatformAdminRequest

# ---------------------------------------------------------------------------
# create_platform_admin
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.send_password_reset_email")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_create_platform_admin_happy_path(
    mock_init,
    mock_create,
    mock_set_claims,
    mock_reset_email,
):
    """Create a platform_admin user and send the set-password email."""
    mock_create.return_value = SimpleNamespace(uid="padmin-uid")

    payload = PlatformAdminRequest(email="padmin@platform.example", name="P Admin")
    result = service.create_platform_admin(payload)

    assert result.uid == "padmin-uid"
    assert result.status == "invited"

    # Claims must have role=platform_admin and NO tenant_id.
    claims_arg = mock_set_claims.call_args.args[1]
    assert claims_arg["role"] == "platform_admin"
    assert "tenant_id" not in claims_arg

    mock_reset_email.assert_called_once_with("padmin@platform.example")


@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_create_platform_admin_duplicate_email_returns_409(mock_init, mock_create):
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
        service.create_platform_admin(
            PlatformAdminRequest(
                email="dup@platform.example",
                name="Dup",
            )
        )

    assert exc_info.value.status_code == 409


@patch("app.modules.identity.service.auth.delete_user")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_create_platform_admin_compensation_deletes_user(
    mock_init,
    mock_create,
    mock_set_claims,
    mock_delete,
):
    """If claim-setting or email-send fails, the Auth user must be deleted."""
    mock_create.return_value = SimpleNamespace(uid="comp-padmin-uid")
    mock_set_claims.side_effect = RuntimeError("Claims service down")

    with pytest.raises(AppError) as exc_info:
        service.create_platform_admin(
            PlatformAdminRequest(email="fail@platform.example", name="Fail")
        )

    assert exc_info.value.code == "platform_admin_creation_failed"
    mock_delete.assert_called_once_with("comp-padmin-uid")


# ---------------------------------------------------------------------------
# list_tenants
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.get_firestore_client")
def test_list_tenants_returns_paginated_list(mock_get_db):
    """list_tenants must return a list of TenantSummary with next_cursor when more exist."""
    from datetime import datetime

    def _make_doc(tenant_id, name):
        doc = MagicMock()
        doc.id = tenant_id
        doc.to_dict.return_value = {
            "name": name,
            "admin_email": f"admin@{tenant_id}.example",
            "status": "active",
            "created_at": datetime(2026, 1, 1, tzinfo=UTC),
        }
        return doc

    # Return 3 docs for a limit of 2 — signals there is a next page.
    docs = [_make_doc(f"t{i}", f"Tenant {i}") for i in range(3)]

    query_mock = MagicMock()
    query_mock.order_by.return_value = query_mock
    query_mock.limit.return_value = query_mock
    query_mock.start_after.return_value = query_mock
    query_mock.stream.return_value = iter(docs)

    tenants_col = MagicMock()
    tenants_col.order_by.return_value = query_mock

    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    result = service.list_tenants(limit=2)

    assert len(result.tenants) == 2
    assert result.next_cursor == "t1"


@patch("app.modules.identity.service.get_firestore_client")
def test_list_tenants_no_next_cursor_when_last_page(mock_get_db):
    """next_cursor must be None when there are no more pages."""
    from datetime import datetime

    def _make_doc(tenant_id):
        doc = MagicMock()
        doc.id = tenant_id
        doc.to_dict.return_value = {
            "name": f"Tenant {tenant_id}",
            "admin_email": f"admin@{tenant_id}.example",
            "status": "active",
            "created_at": datetime(2026, 1, 1, tzinfo=UTC),
        }
        return doc

    docs = [_make_doc(f"t{i}") for i in range(2)]

    query_mock = MagicMock()
    query_mock.order_by.return_value = query_mock
    query_mock.limit.return_value = query_mock
    query_mock.stream.return_value = iter(docs)

    tenants_col = MagicMock()
    tenants_col.order_by.return_value = query_mock

    db = MagicMock()
    db.collection.return_value = tenants_col
    mock_get_db.return_value = db

    result = service.list_tenants(limit=20)

    assert result.next_cursor is None
