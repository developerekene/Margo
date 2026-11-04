from unittest.mock import patch

from app.modules.identity import service
from app.modules.identity.schemas import ForgotPasswordRequest

SEND_PATH = "app.modules.identity.service.send_password_reset_email"


def test_response_is_identical_on_success_and_failure():
    request = ForgotPasswordRequest(email="someone@example.com")

    with patch(SEND_PATH):
        sent = service.request_password_reset(request)

    with patch(SEND_PATH, side_effect=ValueError("EMAIL_NOT_FOUND")):
        failed = service.request_password_reset(request)

    assert sent == failed
