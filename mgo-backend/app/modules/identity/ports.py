from app.core.firebase import verify_id_token


def verify_token(token: str) -> dict:
    """
    Verifies a Firebase ID token and returns a normalized claims dict:
    { "uid": str, "role": str, "tenant_id": str | None }

    Raises ValueError if the token is invalid/expired — callers turn this into a proper 401.
    """
    try:
        decoded = verify_id_token(token)
    except Exception as e:
        raise ValueError(f"Invalid or expired token: {e}")

    return {
        "uid": decoded.get("uid"),
        "role": decoded.get("role"),
        "tenant_id": decoded.get("tenant_id"),
    }