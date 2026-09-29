from fastapi import Depends, Header, HTTPException

from app.modules.identity.ports import verify_token


def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Reads the Authorization header, verifies the token, returns the caller's
    claims dict: { "uid", "role", "tenant_id" }.

    Any endpoint that adds `user = Depends(get_current_user)` as a parameter
    automatically requires a valid token — FastAPI runs this before the
    endpoint's own code executes.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        return verify_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


def require_role(allowed_roles: list[str]):
    """
    Returns a dependency that also checks the caller's role.
    Usage: Depends(require_role(["company_owner", "company_admin"]))
    """
    def check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="permission_denied")
        return user

    return check