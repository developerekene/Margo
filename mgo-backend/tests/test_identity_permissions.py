from unittest.mock import patch
from fastapi import HTTPException
import pytest

from app.modules.identity.permissions import get_current_user, require_role


def test_missing_bearer_prefix_rejected():
    with pytest.raises(HTTPException) as exc:
        get_current_user(authorization="not-a-bearer-token")
    assert exc.value.status_code == 401


@patch("app.modules.identity.permissions.verify_token")
def test_valid_token_returns_claims(mock_verify):
    mock_verify.return_value = {"uid": "abc", "role": "company_owner", "tenant_id": "t1"}
    result = get_current_user(authorization="Bearer faketoken123")
    assert result["role"] == "company_owner"


@patch("app.modules.identity.permissions.verify_token")
def test_require_role_rejects_wrong_role(mock_verify):
    mock_verify.return_value = {"uid": "abc", "role": "company_member", "tenant_id": "t1"}
    check = require_role(["company_owner", "company_admin"])
    with pytest.raises(HTTPException) as exc:
        check(user=get_current_user(authorization="Bearer faketoken123"))
    assert exc.value.status_code == 403