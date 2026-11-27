"""FastAPI authentication dependencies for the knowledge module.

Public endpoints use ``require_tenant_access`` from app.shared.auth.
Internal (Cloud Tasks) endpoints use ``require_cloud_tasks_token`` defined here.
"""

import logging

from fastapi import Header, HTTPException

from app.modules.knowledge.oidc import OIDCVerificationError, verify_cloud_tasks_token

logger = logging.getLogger("margo")


def require_cloud_tasks_token(authorization: str = Header(...)) -> dict:
    """Verify the Google OIDC token attached by Cloud Tasks.

    Returns the decoded claims on success.
    Raises HTTP 403 on any failure — not 401, because an OIDC token with
    the wrong identity is an authorisation failure, not an authentication one.

    Usage::

        @router.post("/internal/process-page")
        def process_page(..., claims: dict = Depends(require_cloud_tasks_token)):
            ...
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "invalid_task_token",
                "message": "Missing or malformed Authorization header.",
            },
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        claims = verify_cloud_tasks_token(token)
    except OIDCVerificationError as exc:
        logger.warning("Cloud Tasks OIDC verification failed: %s", exc)
        raise HTTPException(
            status_code=403,
            detail={
                "code": "invalid_task_token",
                "message": "Cloud Tasks OIDC token is invalid or not authorised.",
            },
        )

    return claims
