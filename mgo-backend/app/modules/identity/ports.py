import logging
import re

from app.core.firebase import get_firestore_client, verify_id_token

logger = logging.getLogger("margo")

# ---------------------------------------------------------------------------
# Role → action permission matrix.
# Extend this table when new actions are introduced; no other code changes needed.
# ---------------------------------------------------------------------------
_PERMISSIONS: dict[str, set[str]] = {
    "platform_admin": {
        "list_tenants",
        "inspect_tenant",
        "list_users",
        "invite_user",
        "remove_user",
        "manage_domains",
        "view_billing",
        "view_logs",
    },
    "company_owner": {
        "list_users",
        "invite_user",
        "remove_user",
        "manage_domains",
        "view_billing",
    },
    "company_admin": {
        "list_users",
        "invite_user",
        "remove_user",
        "manage_domains",
    },
    "company_member": set(),
}


def verify_token(token: str) -> dict:
    """Verify a Firebase ID token and return a normalised claims dict.

    Returns: { "uid", "email", "role", "tenant_id" }

    Raises ValueError if the token is invalid, expired, or revoked — callers
    turn this into a proper 401.
    """
    try:
        decoded = verify_id_token(token)
    except Exception as error:
        logger.warning("Token verification failed: %s", error)
        raise ValueError("Invalid or expired token.")

    return {
        "uid": decoded.get("uid"),
        "email": decoded.get("email"),
        "role": decoded.get("role"),
        "tenant_id": decoded.get("tenant_id"),
    }


def resolve_widget(widget_id: str, origin_domain: str) -> str:
    """Resolve a widget_id + origin to a tenant_id.

    Normalises ``origin_domain`` the same way as stored domains (strips scheme,
    port, and path; lowercased) before comparing against allowed_domains.

    Raises ValueError with a descriptive message for:
    - Unknown widget_id
    - Domain not in the widget's allowed list
    - Tenant not active
    """
    normalised_origin = _normalise_domain(origin_domain)

    db = get_firestore_client()
    widget_doc = db.collection("widgets").document(widget_id).get()

    if not widget_doc.exists:
        raise ValueError(f"Unknown widget: {widget_id}")

    widget_data = widget_doc.to_dict()
    allowed = widget_data.get("allowed_domains", [])

    if normalised_origin not in allowed:
        raise ValueError(
            f"Domain '{normalised_origin}' is not authorised for widget {widget_id}"
        )

    tenant_id = widget_data.get("tenant_id")

    tenant_doc = db.collection("tenants").document(tenant_id).get()
    if not tenant_doc.exists:
        raise ValueError(f"Tenant not found for widget {widget_id}")

    if tenant_doc.to_dict().get("status") != "active":
        raise ValueError(f"Tenant '{tenant_id}' is not active")

    return tenant_id


def check_permission(claims: dict, tenant_id: str, action: str) -> bool:
    """Return True if the caller may perform ``action`` on ``tenant_id``.

    Checks the role-to-action matrix and, for tenant-scoped roles, verifies
    the caller belongs to the target tenant.
    """
    role = claims.get("role", "")
    allowed_actions = _PERMISSIONS.get(role, set())

    if action not in allowed_actions:
        return False

    # platform_admin acts cross-tenant.
    if role == "platform_admin":
        return True

    # All other roles must belong to the same tenant.
    return claims.get("tenant_id") == tenant_id


def _normalise_domain(raw: str) -> str:
    """Strip scheme, path, port, and trailing slashes; lowercase.

    Examples:
        "https://acme.example:8080/some/path" -> "acme.example"
        "localhost:3000"                       -> "localhost"
    """
    # Remove scheme (http:// or https://).
    without_scheme = re.sub(r"^https?://", "", raw.strip())
    # Take only the host part (drop path and query).
    host_part = without_scheme.split("/")[0]
    # Drop port.
    host_no_port = host_part.split(":")[0]
    return host_no_port.lower()
