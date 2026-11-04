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
    MeResponse,
    PlatformAdminRequest,
    RegisterRequest,
    WidgetDomainRequest,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Public endpoints (no auth)
# ---------------------------------------------------------------------------


@router.post("/register", response_model=dict)
def register(payload: RegisterRequest):
    """Create a new tenant and owner account."""
    result = service.register_tenant(payload)
    return envelope(data=result.model_dump())


@router.post("/login", response_model=dict)
def login(payload: LoginRequest):
    """Authenticate with email + password and return a Firebase ID token."""
    result = service.login(payload)
    return envelope(data=result.model_dump())


# ---------------------------------------------------------------------------
# Authenticated — caller's own profile
# ---------------------------------------------------------------------------


@router.get("/me", response_model=dict)
def me(user: dict = Depends(get_current_user)):
    """Return the authenticated caller's profile and tenant claims."""
    result = MeResponse(
        uid=user["uid"],
        email=user.get("email", ""),
        role=user.get("role"),
        tenant_id=user.get("tenant_id"),
    )
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


@router.post("/forgot-password", response_model=dict)
def forgot_password(payload: ForgotPasswordRequest):
    """Send a password reset email. The response is always the same."""
    result = service.request_password_reset(payload)
    return envelope(data=result.model_dump())
