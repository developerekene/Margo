import logging
import re
import secrets
from datetime import UTC, datetime

from firebase_admin import auth

from app.core.firebase import (
    get_firestore_client,
    init_firebase,
    send_password_reset_email,
    sign_in_with_password,
)
from app.core.responses import AppError
from app.modules.identity.events import emit_tenant_registered
from app.modules.identity.ports import verify_token
from app.modules.identity.schemas import (
    AuthResult,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    InviteRequest,
    InviteResponse,
    LoginRequest,
    PendingInviteListResponse,
    PlatformAdminRequest,
    PlatformAdminResponse,
    RegisterRequest,
    TenantListResponse,
    TenantSummary,
    UserListResponse,
    UserResponse,
    WidgetDomainListResponse,
)

logger = logging.getLogger("margo")

# Domain constants — change once, applies everywhere.
_MAX_WIDGET_DOMAINS = 20
_DEFAULT_PAGE_LIMIT = 20
_MAX_PAGE_LIMIT = 100
_MEMBER_STATUS_INVITED = "invited"
_MEMBER_STATUS_ACTIVE = "active"
_TENANT_STATUS_ACTIVE = "active"
_WIDGET_ID_PREFIX = "wgt_"
_WIDGET_ID_HEX_BYTES = 6  # produces 12 hex chars


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _generate_tenant_id(company_name: str) -> str:
    """Produce a URL-safe tenant slug with a random suffix."""
    slug = re.sub(r"[^a-z0-9]+", "-", company_name.lower()).strip("-")
    suffix = secrets.token_hex(3)
    return f"{slug}-{suffix}"


def _generate_widget_id() -> str:
    """Produce a unique widget identifier: wgt_<12 hex chars>."""
    return _WIDGET_ID_PREFIX + secrets.token_hex(_WIDGET_ID_HEX_BYTES)


def _normalise_domain(raw: str) -> str:
    """Strip scheme, port, path from a domain string and lowercase it."""
    without_scheme = re.sub(r"^https?://", "", raw.strip())
    host_part = without_scheme.split("/")[0]
    host_no_port = host_part.split(":")[0]
    return host_no_port.lower()


def _parse_cursor_limit(
    limit_param: int | None,
    cursor_param: str | None,
) -> tuple[int, str | None]:
    """Clamp page limit and pass the cursor through."""
    if limit_param is None:
        limit = _DEFAULT_PAGE_LIMIT
    else:
        limit = min(max(1, limit_param), _MAX_PAGE_LIMIT)
    return limit, cursor_param


def _user_doc_to_response(doc_data: dict) -> UserResponse:
    """Convert a Firestore member document to a UserResponse schema."""
    created_at = doc_data.get("created_at")
    if hasattr(created_at, "isoformat"):
        created_at = created_at.isoformat()
    return UserResponse(
        uid=doc_data["uid"],
        email=doc_data["email"],
        name=doc_data.get("name", ""),
        role=doc_data["role"],
        status=doc_data["status"],
        invited_by=doc_data.get("invited_by"),
        created_at=created_at or "",
    )


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register_tenant(payload: RegisterRequest) -> AuthResult:
    """Create a new tenant + owner account.

    Steps (with compensation on failure):
    1. Create the Firebase Auth user.
    2. Set claims { role: company_owner, tenant_id }.
    3. Write the tenant document.
    4. Generate a widget_id and write the widget document.
    5. Write the owner's member document.
    6. Emit TenantRegistered event.
    7. Sign in and return the token.

    Any failure after step 1 deletes the Auth user so the email can be re-used.
    """
    init_firebase()
    tenant_id = _generate_tenant_id(payload.company_name)
    widget_id = _generate_widget_id()

    # -- Step 1: create the Firebase Auth user --------------------------------
    try:
        user = auth.create_user(
            email=payload.company_email,
            password=payload.password,
            display_name=payload.admin_name,
        )
    except auth.EmailAlreadyExistsError:
        raise AppError(
            "email_already_registered",
            "An account with this email already exists.",
            409,
        )

    # -- Steps 2-7: everything else, with compensation on failure -------------
    try:
        # SAFEGUARD: role is hardcoded here; the request body has no role field.
        auth.set_custom_user_claims(
            user.uid,
            {"role": "company_owner", "tenant_id": tenant_id},
        )

        db = get_firestore_client()

        db.collection("tenants").document(tenant_id).set(
            {
                "name": payload.company_name,
                "admin_email": payload.company_email,
                "website_url": (
                    str(payload.website_url) if payload.website_url else None
                ),
                "status": _TENANT_STATUS_ACTIVE,
                "widget_id": widget_id,
                "created_at": datetime.now(UTC),
            }
        )

        db.collection("widgets").document(widget_id).set(
            {
                "tenant_id": tenant_id,
                "allowed_domains": [],
            }
        )

        db.collection("tenants").document(tenant_id).collection("members").document(
            user.uid
        ).set(
            {
                "uid": user.uid,
                "email": payload.company_email,
                "name": payload.admin_name,
                "role": "company_owner",
                "status": _MEMBER_STATUS_ACTIVE,
                "invited_by": None,
                "created_at": datetime.now(UTC),
            }
        )

        emit_tenant_registered(
            tenant_id=tenant_id,
            admin_email=payload.company_email,
        )

        signin = sign_in_with_password(payload.company_email, payload.password)

    except Exception:
        # Best-effort cleanup — delete the Auth user so the email is free.
        try:
            auth.delete_user(user.uid)
        except Exception:
            logger.exception(
                "Compensation: failed to delete Auth user uid=%s", user.uid
            )
        # Also attempt to clean up any Firestore docs written.
        try:
            db = get_firestore_client()
            db.collection("tenants").document(tenant_id).delete()
            db.collection("widgets").document(widget_id).delete()
        except Exception:
            logger.exception(
                "Compensation: failed to delete Firestore docs for tenant=%s",
                tenant_id,
            )
        raise AppError(
            "registration_failed",
            "Registration could not be completed. Please try again.",
            500,
        )

    return AuthResult(
        token=signin["idToken"],
        uid=user.uid,
        role="company_owner",
        tenant_id=tenant_id,
        email=payload.company_email,
    )


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

# Firebase error codes that map to 429 rather than 401.
_RATE_LIMIT_CODES = {"TOO_MANY_ATTEMPTS_TRY_LATER", "TOO_MANY_REQUESTS"}

# Generic message returned to callers — Firebase codes are logged, never sent.
_INVALID_CREDENTIALS_MSG = "Invalid email or password."


def login(payload: LoginRequest) -> AuthResult:
    """Authenticate with email + password via Firebase Identity Toolkit."""
    init_firebase()

    try:
        signin = sign_in_with_password(payload.email, payload.password)
    except ValueError as e:
        error_str = str(e)
        logger.warning("Login failed for email=%s: %s", payload.email, error_str)

        # Extract the Firebase error code from the message to decide status.
        firebase_code = _extract_firebase_code(error_str)
        if firebase_code in _RATE_LIMIT_CODES:
            raise AppError(
                "too_many_attempts", "Too many attempts. Try again later.", 429
            )

        raise AppError("invalid_credentials", _INVALID_CREDENTIALS_MSG, 401)

    claims = verify_token(signin["idToken"])

    # Reject tokens that have no role claim.
    if not claims.get("role"):
        raise AppError("permission_denied", "This account has no role assigned.", 403)

    tenant_id = claims.get("tenant_id")

    if tenant_id:
        db = get_firestore_client()

        tenant_doc = db.collection("tenants").document(tenant_id).get()
        if not tenant_doc.exists:
            raise AppError("tenant_not_found", "Tenant does not exist.", 404)
        if tenant_doc.to_dict().get("status") != _TENANT_STATUS_ACTIVE:
            raise AppError(
                "subscription_inactive",
                "This tenant's account is not active.",
                403,
            )

        # Flip an invited member's status to active on their first successful login.
        uid = claims["uid"]
        member_ref = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("members")
            .document(uid)
        )
        member_doc = member_ref.get()
        if member_doc.exists:
            member_data = member_doc.to_dict()
            if member_data.get("status") == _MEMBER_STATUS_INVITED:
                member_ref.update({"status": _MEMBER_STATUS_ACTIVE})

    return AuthResult(
        token=signin["idToken"],
        uid=claims["uid"],
        role=claims.get("role"),
        tenant_id=tenant_id,
        email=claims.get("email"),
    )


def _extract_firebase_code(error_message: str) -> str:
    """Pull the Firebase error code out of the ValueError message string."""
    # The message format is: "Firebase sign-in failed: THE_CODE"
    parts = error_message.split("Firebase sign-in failed: ", 1)
    return parts[1].strip() if len(parts) > 1 else ""


# ---------------------------------------------------------------------------
# User listing
# ---------------------------------------------------------------------------


def list_users(
    tenant_id: str,
    limit: int | None = None,
    cursor: str | None = None,
) -> UserListResponse:
    """Return a paginated list of members for a tenant."""
    page_limit, start_cursor = _parse_cursor_limit(limit, cursor)

    db = get_firestore_client()
    query = (
        db.collection("tenants")
        .document(tenant_id)
        .collection("members")
        .order_by("__name__")
        .limit(page_limit + 1)
    )

    if start_cursor:
        cursor_doc = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("members")
            .document(start_cursor)
            .get()
        )
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    docs = list(query.stream())

    # Determine if there is a next page.
    has_more = len(docs) > page_limit
    page_docs = docs[:page_limit]

    users = [_user_doc_to_response(d.to_dict()) for d in page_docs]
    next_cursor = page_docs[-1].id if has_more else None

    return UserListResponse(users=users, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# Invite
# ---------------------------------------------------------------------------


def invite_user(
    tenant_id: str,
    payload: InviteRequest,
    invited_by_uid: str,
) -> InviteResponse:
    """Invite a new user to a tenant.

    Steps (with compensation on failure):
    1. Create the Firebase Auth user with a random throwaway password.
    2. Set claims { role, tenant_id } — tenant_id comes from the validated path, never body.
    3. Write the member doc with status "invited".
    4. Send a Firebase password-reset email so the invitee can set their own password.

    If any step after user creation fails, the user is deleted so the email
    address is freed and can be re-invited.
    """
    init_firebase()
    throwaway_password = secrets.token_urlsafe(24)

    try:
        user = auth.create_user(
            email=payload.email,
            password=throwaway_password,
            display_name=payload.name,
        )
    except auth.EmailAlreadyExistsError:
        # Do not reveal which tenant owns the existing account.
        raise AppError(
            "email_already_registered",
            "An account with this email already exists.",
            409,
        )

    try:
        auth.set_custom_user_claims(
            user.uid,
            {
                "role": payload.role,
                "tenant_id": tenant_id,  # Always from the path, never the body.
            },
        )

        db = get_firestore_client()
        db.collection("tenants").document(tenant_id).collection("members").document(
            user.uid
        ).set(
            {
                "uid": user.uid,
                "email": str(payload.email),
                "name": payload.name,
                "role": payload.role,
                "status": _MEMBER_STATUS_INVITED,
                "invited_by": invited_by_uid,
                "created_at": datetime.now(UTC),
            }
        )

        send_password_reset_email(str(payload.email))

    except Exception:
        # Compensation: delete the Auth user so the email can be re-invited.
        try:
            auth.delete_user(user.uid)
        except Exception:
            logger.exception(
                "Compensation: failed to delete invited user uid=%s", user.uid
            )
        # Also remove the member doc if it was written.
        try:
            db = get_firestore_client()
            (
                db.collection("tenants")
                .document(tenant_id)
                .collection("members")
                .document(user.uid)
                .delete()
            )
        except Exception:
            logger.exception(
                "Compensation: failed to delete member doc uid=%s tenant=%s",
                user.uid,
                tenant_id,
            )
        raise AppError(
            "invite_failed",
            "Invite could not be completed. Please try again.",
            500,
        )

    logger.info(
        "User invited: uid=%s email=%s tenant=%s role=%s invited_by=%s",
        user.uid,
        payload.email,
        tenant_id,
        payload.role,
        invited_by_uid,
    )

    return InviteResponse(status="invited", email=payload.email)


def list_pending_invites(
    tenant_id: str,
    limit: int | None = None,
    cursor: str | None = None,
) -> PendingInviteListResponse:
    """Return members with status 'invited' for a tenant.

    Note: combining a where-filter with order_by on a different field would
    require a composite index; we filter by status in Python instead, since
    invited lists are expected to be small.
    """
    page_limit, start_cursor = _parse_cursor_limit(limit, cursor)

    db = get_firestore_client()
    # Order by document ID only — no composite index needed.
    query = (
        db.collection("tenants")
        .document(tenant_id)
        .collection("members")
        .order_by("__name__")
        .limit(page_limit + 1)
    )

    if start_cursor:
        cursor_doc = (
            db.collection("tenants")
            .document(tenant_id)
            .collection("members")
            .document(start_cursor)
            .get()
        )
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    docs = list(query.stream())
    invited_docs = [
        d for d in docs if d.to_dict().get("status") == _MEMBER_STATUS_INVITED
    ]

    # Pagination is approximate — we over-fetch and filter, then re-apply limit.
    has_more = len(docs) > page_limit
    page_docs = invited_docs[:page_limit]

    invites = [_user_doc_to_response(d.to_dict()) for d in page_docs]
    next_cursor = page_docs[-1].id if (has_more and page_docs) else None

    return PendingInviteListResponse(invites=invites, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# Remove user
# ---------------------------------------------------------------------------

# What each role may remove.
_REMOVAL_ALLOWED: dict[str, set[str]] = {
    "company_owner": {"company_admin", "company_member"},
    "company_admin": {"company_member"},
}


def remove_user(
    tenant_id: str,
    target_uid: str,
    caller: dict,
) -> None:
    """Remove a member from a tenant.

    Rules:
    - Owner may remove admins and members.
    - Admin may remove members only.
    - Self-removal is never allowed.
    - Owner cannot be removed (only one owner per tenant).
    - The target must belong to this tenant, else 404.

    Steps on success:
    1. Remove the member document.
    2. Revoke the user's refresh tokens.
    3. Delete the Firebase Auth user (frees the email for re-invite).
    """
    caller_uid = caller["uid"]
    caller_role = caller.get("role")

    if target_uid == caller_uid:
        raise AppError("cannot_remove_self", "You cannot remove your own account.", 400)

    db = get_firestore_client()
    member_ref = (
        db.collection("tenants")
        .document(tenant_id)
        .collection("members")
        .document(target_uid)
    )
    member_doc = member_ref.get()

    if not member_doc.exists:
        raise AppError("user_not_found", "User not found in this tenant.", 404)

    target_data = member_doc.to_dict()
    target_role = target_data.get("role")

    if target_role == "company_owner":
        raise AppError(
            "cannot_remove_owner",
            "The tenant owner cannot be removed.",
            403,
        )

    removable_roles = _REMOVAL_ALLOWED.get(caller_role, set())
    if target_role not in removable_roles:
        raise AppError(
            "permission_denied",
            "You do not have permission to remove this user.",
            403,
        )

    # All checks passed — remove in order.
    member_ref.delete()

    try:
        auth.revoke_refresh_tokens(target_uid)
    except Exception:
        logger.exception(
            "Failed to revoke tokens for uid=%s tenant=%s", target_uid, tenant_id
        )

    try:
        auth.delete_user(target_uid)
    except Exception:
        logger.exception(
            "Failed to delete Auth user uid=%s tenant=%s", target_uid, tenant_id
        )

    logger.info(
        "User removed: uid=%s tenant=%s removed_by_uid=%s removed_by_role=%s",
        target_uid,
        tenant_id,
        caller_uid,
        caller_role,
    )


# ---------------------------------------------------------------------------
# Widget domains
# ---------------------------------------------------------------------------


def list_widget_domains(tenant_id: str) -> WidgetDomainListResponse:
    """Return allowed domains for a tenant's widget."""
    db = get_firestore_client()
    widget_id = _get_widget_id(db, tenant_id)
    widget_doc = db.collection("widgets").document(widget_id).get()

    if not widget_doc.exists:
        return WidgetDomainListResponse(domains=[])

    domains = widget_doc.to_dict().get("allowed_domains", [])
    return WidgetDomainListResponse(domains=domains)


def add_widget_domain(tenant_id: str, raw_domain: str) -> WidgetDomainListResponse:
    """Add a normalised domain to a tenant's widget allowed list.

    Rejects wildcards, allows 'localhost', deduplicates, enforces max 20.
    """
    domain = _normalise_domain(raw_domain)

    if "*" in domain:
        raise AppError(
            "wildcard_not_allowed",
            "Wildcard domains are not permitted.",
            400,
        )

    db = get_firestore_client()
    widget_id = _get_widget_id(db, tenant_id)
    widget_ref = db.collection("widgets").document(widget_id)
    widget_doc = widget_ref.get()

    current_domains: list[str] = []
    if widget_doc.exists:
        current_domains = widget_doc.to_dict().get("allowed_domains", [])

    if domain in current_domains:
        # Idempotent — already present, nothing to do.
        return WidgetDomainListResponse(domains=current_domains)

    if len(current_domains) >= _MAX_WIDGET_DOMAINS:
        raise AppError(
            "domain_limit_reached",
            f"A tenant may have at most {_MAX_WIDGET_DOMAINS} allowed domains.",
            400,
        )

    updated = current_domains + [domain]
    widget_ref.set(
        {"allowed_domains": updated},
        merge=True,
    )
    return WidgetDomainListResponse(domains=updated)


def _get_widget_id(db, tenant_id: str) -> str:
    """Return the widget_id for a tenant, creating the widget lazily if missing."""
    tenant_doc = db.collection("tenants").document(tenant_id).get()
    if not tenant_doc.exists:
        raise AppError("tenant_not_found", "Tenant not found.", 404)

    tenant_data = tenant_doc.to_dict()
    widget_id = tenant_data.get("widget_id")

    if not widget_id:
        # Lazy creation for tenants that predate widget_id.
        widget_id = _generate_widget_id()
        db.collection("tenants").document(tenant_id).update({"widget_id": widget_id})
        db.collection("widgets").document(widget_id).set(
            {
                "tenant_id": tenant_id,
                "allowed_domains": [],
            }
        )

    return widget_id


# ---------------------------------------------------------------------------
# Tenants list (platform admin)
# ---------------------------------------------------------------------------


def list_tenants(
    limit: int | None = None,
    cursor: str | None = None,
) -> TenantListResponse:
    """Return a paginated list of all tenants (platform-admin only)."""
    page_limit, start_cursor = _parse_cursor_limit(limit, cursor)

    db = get_firestore_client()
    query = db.collection("tenants").order_by("__name__").limit(page_limit + 1)

    if start_cursor:
        cursor_doc = db.collection("tenants").document(start_cursor).get()
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    docs = list(query.stream())
    has_more = len(docs) > page_limit
    page_docs = docs[:page_limit]

    tenants = []
    for d in page_docs:
        data = d.to_dict()
        created_at = data.get("created_at")
        if hasattr(created_at, "isoformat"):
            created_at = created_at.isoformat()
        tenants.append(
            TenantSummary(
                tenant_id=d.id,
                name=data.get("name", ""),
                admin_email=data.get("admin_email", ""),
                status=data.get("status", ""),
                created_at=created_at or "",
            )
        )

    next_cursor = page_docs[-1].id if has_more else None
    return TenantListResponse(tenants=tenants, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# Platform admin creation
# ---------------------------------------------------------------------------


def create_platform_admin(payload: PlatformAdminRequest) -> PlatformAdminResponse:
    """Create a platform_admin user account and send them a set-password email.

    Platform admins have no tenant_id claim. The only other way to create a
    platform admin is the bootstrap_platform_admin.py CLI script.
    """
    init_firebase()
    throwaway_password = secrets.token_urlsafe(24)

    try:
        user = auth.create_user(
            email=payload.email,
            password=throwaway_password,
            display_name=payload.name,
        )
    except auth.EmailAlreadyExistsError:
        raise AppError(
            "email_already_registered",
            "An account with this email already exists.",
            409,
        )

    try:
        # No tenant_id for platform admins.
        auth.set_custom_user_claims(user.uid, {"role": "platform_admin"})
        send_password_reset_email(str(payload.email))
    except Exception:
        try:
            auth.delete_user(user.uid)
        except Exception:
            logger.exception(
                "Compensation: failed to delete platform admin uid=%s", user.uid
            )
        raise AppError(
            "platform_admin_creation_failed",
            "Could not create platform admin. Please try again.",
            500,
        )

    logger.info("Platform admin created: uid=%s email=%s", user.uid, payload.email)

    return PlatformAdminResponse(
        uid=user.uid,
        email=payload.email,
        status="invited",
    )


_FORGOT_PASSWORD_MESSAGE = (
    "If an account exists for this email, a password reset link has been sent."
)


def request_password_reset(
    payload: ForgotPasswordRequest,
) -> ForgotPasswordResponse:
    """Send a reset link if the account exists, without revealing whether it does."""
    try:
        send_password_reset_email(str(payload.email))
    except Exception as error:
        logger.warning("Password reset not sent: %s", type(error).__name__)

    return ForgotPasswordResponse(message=_FORGOT_PASSWORD_MESSAGE)
