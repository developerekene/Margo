from fastapi import APIRouter, Depends, Query

from app.core.responses import envelope
from app.modules.identity import service
from app.modules.identity.permissions import (
    get_current_user,
    require_role,
    require_tenant_access,
)
from app.modules.identity.schemas import (
    ForgotPasswordRequest,
    InviteRequest,
    LoginRequest,
    PlatformAdminRequest,
    RegisterRequest,
    ResendVerificationRequest,
    WidgetDomainRequest,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Public endpoints (no auth)
# ---------------------------------------------------------------------------


@router.post("/register", response_model=dict)
def register(payload: RegisterRequest):
    """Create a new tenant and owner account.

    Returns a verification-required response.  No session token is issued.
    The user must verify their email before signing in.
    """
    result = service.register_tenant(payload)
    return envelope(data=result.model_dump())


@router.post("/login", response_model=dict)
def login(payload: LoginRequest):
    """Authenticate with email + password and return a Firebase ID token."""
    result = service.login(payload)
    return envelope(data=result.model_dump())


@router.post("/resend-verification", response_model=dict)
def resend_verification(payload: ResendVerificationRequest):
    """Resend an email-verification link to an unverified account.

    Rate-limited to one send per address per 60 seconds.  Always returns the
    same response regardless of whether the address is known or verified.
    """
    result = service.resend_verification(payload)
    return envelope(data=result.model_dump())


@router.post("/forgot-password", response_model=dict)
def forgot_password(payload: ForgotPasswordRequest):
    """Send a password reset email. The response is always the same."""
    result = service.request_password_reset(payload)
    return envelope(data=result.model_dump())


# ---------------------------------------------------------------------------
# Authenticated — caller's own profile and session management
# ---------------------------------------------------------------------------


@router.get("/me", response_model=dict)
def me(user: dict = Depends(get_current_user)):
    """Return the authenticated caller's profile, role, and company context."""
    result = service.get_me(user)
    return envelope(data=result.model_dump())


@router.post("/logout", response_model=dict)
def logout(user: dict = Depends(get_current_user)):
    """Sign out from the current device.

    No server-side token invalidation is possible per-device with Firebase
    bearer tokens.  The client must discard its token.  Other sessions remain
    active.  Use POST /logout/all to revoke all sessions.
    """
    result = service.logout(user)
    return envelope(data=result.model_dump())


@router.post("/logout/all", response_model=dict)
def logout_all(user: dict = Depends(get_current_user)):
    """Sign out from all devices by revoking Firebase refresh tokens.

    Because verify_id_token is called with check_revoked=True on every
    request, this effectively ends all sessions at the next token validation
    (~1 minute window due to Firebase token caching).
    """
    result = service.logout_all(user)
    return envelope(data=result.model_dump())


# ---------------------------------------------------------------------------
# Tenant-scoped user management
# ---------------------------------------------------------------------------


@router.get("/{tenant_id}/users", response_model=dict)
def list_users(
    tenant_id: str,
    limit: int | None = Query(default=None, ge=1, le=100),
    cursor: str | None = Query(default=None),
    user: dict = Depends(
        require_tenant_access(
            roles=["company_owner", "company_admin"],
            allow_platform_admin=True,
        )
    ),
):
    """List members of a tenant (owner, admin of same tenant, or platform_admin)."""
    result = service.list_users(tenant_id, limit=limit, cursor=cursor)
    return envelope(data=result.model_dump())


@router.post("/{tenant_id}/users/invite", response_model=dict)
def invite_user(
    tenant_id: str,
    payload: InviteRequest,
    user: dict = Depends(
        require_tenant_access(roles=["company_owner", "company_admin"])
    ),
):
    """Invite a new user (admin or member) to the tenant."""
    result = service.invite_user(
        tenant_id=tenant_id,
        payload=payload,
        invited_by_uid=user["uid"],
    )
    return envelope(data=result.model_dump())


@router.get("/{tenant_id}/users/invite", response_model=dict)
def list_pending_invites(
    tenant_id: str,
    limit: int | None = Query(default=None, ge=1, le=100),
    cursor: str | None = Query(default=None),
    user: dict = Depends(
        require_tenant_access(roles=["company_owner", "company_admin"])
    ),
):
    """List members with status 'invited' for a tenant."""
    result = service.list_pending_invites(tenant_id, limit=limit, cursor=cursor)
    return envelope(data=result.model_dump())


@router.delete("/{tenant_id}/users/{user_id}", response_model=dict)
def remove_user(
    tenant_id: str,
    user_id: str,
    caller: dict = Depends(
        require_tenant_access(roles=["company_owner", "company_admin"])
    ),
):
    """Remove a member from a tenant with hierarchical role enforcement."""
    service.remove_user(
        tenant_id=tenant_id,
        target_uid=user_id,
        caller=caller,
    )
    return envelope(data={"status": "removed"})


# ---------------------------------------------------------------------------
# Widget domains
# ---------------------------------------------------------------------------


@router.get("/{tenant_id}/widget-domains", response_model=dict)
def list_widget_domains(
    tenant_id: str,
    user: dict = Depends(
        require_tenant_access(roles=["company_owner", "company_admin"])
    ),
):
    """List approved domains for the tenant's chat widget."""
    result = service.list_widget_domains(tenant_id)
    return envelope(data=result.model_dump())


@router.post("/{tenant_id}/widget-domains", response_model=dict)
def add_widget_domain(
    tenant_id: str,
    payload: WidgetDomainRequest,
    user: dict = Depends(
        require_tenant_access(roles=["company_owner", "company_admin"])
    ),
):
    """Add an approved domain to the tenant's chat widget."""
    result = service.add_widget_domain(tenant_id, payload.domain)
    return envelope(data=result.model_dump())


# ---------------------------------------------------------------------------
# Platform-admin-only endpoints
# ---------------------------------------------------------------------------


@router.get("/tenants", response_model=dict)
def list_tenants(
    limit: int | None = Query(default=None, ge=1, le=100),
    cursor: str | None = Query(default=None),
    user: dict = Depends(require_role(["platform_admin"])),
):
    """List all tenants (platform_admin only)."""
    result = service.list_tenants(limit=limit, cursor=cursor)
    return envelope(data=result.model_dump())


@router.post("/platform-admins", response_model=dict)
def create_platform_admin(
    payload: PlatformAdminRequest,
    user: dict = Depends(require_role(["platform_admin"])),
):
    """Create a new platform admin account (platform_admin only)."""
    result = service.create_platform_admin(payload)
    return envelope(data=result.model_dump())



