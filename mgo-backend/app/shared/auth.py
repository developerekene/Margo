"""Shared FastAPI authentication dependencies.

Business modules (billing, knowledge, etc.) cannot import from
app.modules.identity (import-linter independence contract) or from
app.core.firebase directly (firebase-sdk-restricted contract).

This module provides reusable Depends functions so every module that needs
authenticated endpoints can do so without violating those boundaries.
app.shared is not subject to either restriction.
"""

import logging

from fastapi import Depends, Header, HTTPException

from app.core.firebase import verify_id_token

logger = logging.getLogger("margo")


def get_current_user(authorization: str = Header(...)) -> dict:
    """Verify the Authorization header and return normalised claims.

    Returns: { "uid", "email", "role", "tenant_id", "name" }

    - Missing/malformed header → 401
    - Invalid/expired/revoked token → 401
    - Email not yet verified → 403 email_not_verified
    - No role claim → 403 permission_denied
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header.",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = verify_id_token(token)
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    if not decoded.get("email_verified", False):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_not_verified",
                "message": "Email address has not been verified.",
            },
        )

    if not decoded.get("role"):
        raise HTTPException(status_code=403, detail="permission_denied")

    return {
        "uid": decoded.get("uid"),
        "email": decoded.get("email"),
        "role": decoded.get("role"),
        "tenant_id": decoded.get("tenant_id"),
        "name": decoded.get("name"),
    }


def require_role(allowed_roles: list[str]):
    """Return a dependency that checks the caller has one of the allowed roles.

    Usage: user: dict = Depends(require_role(["platform_admin"]))
    """

    def _check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="permission_denied")
        return user

    return _check


def require_tenant_access(roles: list[str], allow_platform_admin: bool = False):
    """Return a dependency enforcing role + tenant ownership.

    The caller's tenant_id claim must match the {tenant_id} path parameter,
    unless allow_platform_admin=True and the caller is a platform_admin.

    Usage:
        user: dict = Depends(
            require_tenant_access(["company_owner", "company_admin"])
        )
    """

    def _check(
        tenant_id: str,
        user: dict = Depends(get_current_user),
    ) -> dict:
        caller_role = user.get("role")

        # Platform admins may access any tenant when explicitly permitted.
        if allow_platform_admin and caller_role == "platform_admin":
            return user

        if caller_role not in roles:
            raise HTTPException(status_code=403, detail="permission_denied")

        # Tenant-scoped roles must belong to the target tenant.
        if user.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=403, detail="permission_denied")

        return user

    return _check
