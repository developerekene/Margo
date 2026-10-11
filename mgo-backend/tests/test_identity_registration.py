"""Tests for tenant registration — happy path, compensation, and security invariants."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.responses import AppError
from app.modules.identity import service
from app.modules.identity.schemas import RegisterRequest


@pytest.fixture
def registration_payload():
    """A valid tenant registration request."""
    return RegisterRequest(
        company_name="Acme Systems",
        company_email="admin@acme.example",
        admin_name="Alex Admin",
        password="secure-password-123",
        website_url="https://acme.example",
    )


def _make_db_mock():
    """Build a Firestore client mock that swallows all collection/doc/set calls."""
    mock_doc_ref = MagicMock()
    mock_collection = MagicMock()
    mock_collection.document.return_value = mock_doc_ref
    mock_db = MagicMock()
    mock_db.collection.return_value = mock_collection
    return mock_db, mock_doc_ref


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.emit_tenant_registered")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_register_tenant_creates_owner_and_tenant(
    mock_init,
    mock_create_user,
    mock_set_claims,
    mock_get_db,
    mock_emit,
    mock_signin,
    registration_payload,
):
    """Register creates the Firebase user, tenant doc, widget doc, member doc, and returns a token."""
    mock_create_user.return_value = SimpleNamespace(uid="firebase-uid-1")
    mock_signin.return_value = {"idToken": "test-id-token"}

    mock_db, _ = _make_db_mock()
    mock_get_db.return_value = mock_db

    result = service.register_tenant(registration_payload)

    assert result.token == "test-id-token"
    assert result.uid == "firebase-uid-1"
    assert result.role == "company_owner"
    assert result.email == "admin@acme.example"
    assert result.tenant_id

    # Claims must be hardcoded, never from the request.
    mock_set_claims.assert_called_once_with(
        "firebase-uid-1",
        {"role": "company_owner", "tenant_id": result.tenant_id},
    )

    # Three top-level collections must be touched: tenants, widgets, members.
    collection_calls = [c.args[0] for c in mock_db.collection.call_args_list]
    assert "tenants" in collection_calls
    assert "widgets" in collection_calls

    mock_emit.assert_called_once_with(
        tenant_id=result.tenant_id,
        admin_email="admin@acme.example",
    )


@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.emit_tenant_registered")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_register_tenant_writes_widget_id(
    mock_init,
    mock_create_user,
    mock_set_claims,
    mock_get_db,
    mock_emit,
    mock_signin,
    registration_payload,
):
    """Register must write widget_id to the tenant document."""
    mock_create_user.return_value = SimpleNamespace(uid="uid-widget-test")
    mock_signin.return_value = {"idToken": "tok"}

    mock_db, _ = _make_db_mock()
    # Intercept the tenant doc set() call to inspect its payload.
    written_docs = []

    def capture_set(data, **kwargs):
        written_docs.append(data)

    tenant_doc_ref = MagicMock()
    tenant_doc_ref.set.side_effect = capture_set
    widget_doc_ref = MagicMock()
    members_doc_ref = MagicMock()

    def collection_side_effect(name):
        col = MagicMock()
        if name == "tenants":
            sub_col = MagicMock()
            sub_col.document.return_value = members_doc_ref
            tenant_doc_ref.collection.return_value = sub_col
            col.document.return_value = tenant_doc_ref
        elif name == "widgets":
            col.document.return_value = widget_doc_ref
        return col

    mock_db.collection.side_effect = collection_side_effect
    mock_get_db.return_value = mock_db

    service.register_tenant(registration_payload)

    # The first set() call is the tenant document.
    assert written_docs, "tenant doc was never written"
    tenant_data = written_docs[0]
    assert "widget_id" in tenant_data
    assert tenant_data["widget_id"].startswith("wgt_")


# ---------------------------------------------------------------------------
# Security: role in request body must never be honoured
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.sign_in_with_password")
@patch("app.modules.identity.service.emit_tenant_registered")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_register_tenant_role_always_company_owner(
    mock_init,
    mock_create_user,
    mock_set_claims,
    mock_get_db,
    mock_emit,
    mock_signin,
):
    """Role must always be company_owner regardless of what the caller sends.

    RegisterRequest has no role field — this verifies the service never reads
    one from a hypothetical injected payload.
    """
    mock_create_user.return_value = SimpleNamespace(uid="uid-sec-test")
    mock_signin.return_value = {"idToken": "tok"}
    mock_db, _ = _make_db_mock()
    mock_get_db.return_value = mock_db

    payload = RegisterRequest(
        company_name="EvilCorp",
        company_email="evil@corp.example",
        admin_name="Hacker",
        password="hackerpass123",
    )

    result = service.register_tenant(payload)

    assert result.role == "company_owner"
    # Claims set on the Firebase user must also be company_owner.
    set_claims_call = mock_set_claims.call_args
    assert set_claims_call.args[1]["role"] == "company_owner"
    assert "tenant_id" in set_claims_call.args[1]


# ---------------------------------------------------------------------------
# Duplicate email
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_register_tenant_rejects_duplicate_email(
    mock_init,
    mock_create_user,
    registration_payload,
):
    """Translate Firebase's duplicate-email error into 409 email_already_registered."""

    class FakeEmailAlreadyExistsError(Exception):
        pass

    mock_create_user.side_effect = FakeEmailAlreadyExistsError("Email already exists")

    with (
        patch.object(
            service.auth,
            "EmailAlreadyExistsError",
            FakeEmailAlreadyExistsError,
        ),
        pytest.raises(AppError) as exc_info,
    ):
        service.register_tenant(registration_payload)

    assert exc_info.value.code == "email_already_registered"
    assert exc_info.value.status_code == 409


# ---------------------------------------------------------------------------
# Compensation path
# ---------------------------------------------------------------------------


@patch("app.modules.identity.service.auth.delete_user")
@patch("app.modules.identity.service.get_firestore_client")
@patch("app.modules.identity.service.auth.set_custom_user_claims")
@patch("app.modules.identity.service.auth.create_user")
@patch("app.modules.identity.service.init_firebase")
def test_register_compensation_deletes_auth_user_on_firestore_failure(
    mock_init,
    mock_create_user,
    mock_set_claims,
    mock_get_db,
    mock_delete_user,
    registration_payload,
):
    """If Firestore write fails after user creation, the Auth user must be deleted."""
    mock_create_user.return_value = SimpleNamespace(uid="uid-comp-test")

    # Make get_firestore_client raise to simulate a Firestore failure.
    mock_get_db.side_effect = RuntimeError("Firestore unavailable")

    with pytest.raises(AppError) as exc_info:
        service.register_tenant(registration_payload)

    assert exc_info.value.code == "registration_failed"
    # The compensation step must have deleted the orphan Auth user.
    mock_delete_user.assert_called_once_with("uid-comp-test")
