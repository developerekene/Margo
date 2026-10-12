from fastapi import Depends, Header, HTTPException

from app.modules.identity.ports import verify_token


def get_current_user(authorization: str = Header(...)) -> dict:
    """Read the Authorization header, verify the token, and return the caller's claims.

    Returns: { "uid", "email", "role", "tenant_id" }

    Any endpoint that adds ``user = Depends(get_current_user)`` requires a valid
    token — FastAPI runs this before the endpoint's own code executes.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        claims = verify_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    # Reject tokens that have no role claim — they cannot be authorised.
    if not claims.get("role"):
        raise HTTPException(status_code=403, detail="permission_denied")

    return claims


def require_role(allowed_roles: list[str]):
    """Return a dependency that checks the caller's role.

    Usage: ``Depends(require_role(["company_owner", "company_admin"]))``
    """

    def check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="permission_denied")
        return user

    return check


def require_tenant_access(
    roles: list[str],
    allow_platform_admin: bool = False,
):
    """Return a dependency that enforces both role and tenant ownership.

    "Own tenant" means the caller's ``tenant_id`` claim matches the ``{tenant_id}``
    path parameter. A mismatch returns 403 permission_denied.

    Set ``allow_platform_admin=True`` for endpoints where a platform_admin may
    act cross-tenant (e.g. GET /tenants, GET /{tenant_id}/users).

    Usage::

        user = Depends(require_tenant_access(
            roles=["company_owner", "company_admin"],
            allow_platform_admin=True,
        ))

    The dependency reads ``tenant_id`` from the *path* via FastAPI's dependency
    injection.  The endpoint must declare it as a path parameter.
    """

    def check(
        tenant_id: str,
        user: dict = Depends(get_current_user),
    ) -> dict:
        caller_role = user.get("role")

        # Platform admins bypass tenant ownership check when allowed.
        if allow_platform_admin and caller_role == "platform_admin":
            return user

        if caller_role not in roles:
            raise HTTPException(status_code=403, detail="permission_denied")

        # Caller must belong to the target tenant.
        if user.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=403, detail="permission_denied")

        return user

    return check
