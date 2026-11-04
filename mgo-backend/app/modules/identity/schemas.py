from typing import Literal

from pydantic import BaseModel, EmailStr, Field, HttpUrl

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    company_email: EmailStr
    admin_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8)
    website_url: HttpUrl | None = None


class AuthResult(BaseModel):
    token: str
    uid: str
    role: str
    tenant_id: str | None = None  # None for platform_admin accounts
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class MeResponse(BaseModel):
    uid: str
    email: EmailStr
    role: str
    tenant_id: str | None = None


# ---------------------------------------------------------------------------
# Users / members
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    uid: str
    email: EmailStr
    name: str
    role: str
    status: str
    invited_by: str | None = None
    created_at: str


class UserListResponse(BaseModel):
    users: list[UserResponse]
    next_cursor: str | None = None


class InviteRequest(BaseModel):
    email: EmailStr
    # platform_admin cannot be granted via the invite flow.
    role: Literal["company_admin", "company_member"]
    name: str = Field(min_length=2, max_length=120)


class InviteResponse(BaseModel):
    status: str
    email: EmailStr


class PendingInviteListResponse(BaseModel):
    invites: list[UserResponse]
    next_cursor: str | None = None


# ---------------------------------------------------------------------------
# Widget domains
# ---------------------------------------------------------------------------


class WidgetDomainRequest(BaseModel):
    domain: str = Field(min_length=3, max_length=253)


class WidgetDomainListResponse(BaseModel):
    domains: list[str]


# ---------------------------------------------------------------------------
# Tenants (platform-admin view)
# ---------------------------------------------------------------------------


class TenantSummary(BaseModel):
    tenant_id: str
    name: str
    admin_email: EmailStr
    status: str
    created_at: str


class TenantListResponse(BaseModel):
    tenants: list[TenantSummary]
    next_cursor: str | None = None


# ---------------------------------------------------------------------------
# Platform admins
# ---------------------------------------------------------------------------


class PlatformAdminRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=120)


class PlatformAdminResponse(BaseModel):
    uid: str
    email: EmailStr
    status: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
