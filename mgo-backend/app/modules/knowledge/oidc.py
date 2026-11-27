"""Cloud Tasks OIDC token verification.

Cloud Tasks attaches a Google-signed OIDC token to every internal callback
request. This module verifies that token so internal endpoints can reject
anything that did not come from our authorised Cloud Tasks service account.

Design notes
------------
- Uses ``google.oauth2.id_token`` + ``google.auth.transport.requests`` from
  the ``google-auth`` library. This is the Google-recommended approach for
  verifying OIDC tokens outside Cloud Run.
- Verification checks: signature (via Google's public certs), issuer, expiry,
  audience, service-account email, email_verified claim.
- The raw token is never logged.
- Raises ``OIDCVerificationError`` for every failure. Callers map this to
  HTTP 403, NOT 401, because a structurally-valid but wrong-identity token is
  an authorisation failure, not an authentication one.
"""

import logging

from app.core.config import settings

logger = logging.getLogger("margo")


class OIDCVerificationError(Exception):
    """Raised when an OIDC token cannot be verified or does not meet our policy."""


def verify_cloud_tasks_token(token: str) -> dict:
    """Verify a Google OIDC token from an inbound Cloud Tasks request.

    Returns the decoded token claims on success.
    Raises OIDCVerificationError on any failure.

    Checks performed (in order):
      1. Audience is configured (fail fast if infra is not wired).
      2. google.oauth2.id_token.verify_oauth2_token validates signature,
         issuer (accounts.google.com), and expiry.
      3. ``email`` claim matches the configured service-account email.
      4. ``email_verified`` claim is True.
    """
    audience = settings.KNOWLEDGE_OIDC_AUDIENCE
    expected_email = settings.KNOWLEDGE_TASK_SA_EMAIL

    if not audience:
        raise OIDCVerificationError(
            "KNOWLEDGE_OIDC_AUDIENCE is not configured. "
            "Internal endpoints cannot authenticate Cloud Tasks requests."
        )
    if not expected_email:
        raise OIDCVerificationError(
            "KNOWLEDGE_TASK_SA_EMAIL is not configured. "
            "Internal endpoints cannot authenticate Cloud Tasks requests."
        )

    if not token:
        raise OIDCVerificationError("Missing OIDC token.")

    try:
        # Import here so the module loads without google-auth being installed
        # in environments that only run non-knowledge tests.
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        request = google_requests.Request()
        claims = google_id_token.verify_oauth2_token(token, request, audience=audience)
    except Exception as exc:
        # Do not log the token itself.
        logger.warning("OIDC token verification failed: %s", type(exc).__name__)
        raise OIDCVerificationError(f"Token verification failed: {exc}") from exc

    # Check the service-account identity.
    token_email = claims.get("email", "")
    if token_email != expected_email:
        logger.warning(
            "OIDC token email mismatch: expected=%s got=%s",
            expected_email,
            token_email,
        )
        raise OIDCVerificationError(
            f"Token email '{token_email}' does not match expected service account."
        )

    # Google's OIDC tokens for service accounts always have email_verified=True,
    # but we check explicitly to catch misconfiguration.
    if not claims.get("email_verified", False):
        raise OIDCVerificationError("OIDC token email_verified is not True.")

    return claims
