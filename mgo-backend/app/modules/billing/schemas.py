"""Billing data shapes shared by the service, ports and API."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class SubscriptionStatus(str, Enum):
    """Lifecycle states from the API Contract."""

    TRIAL = "TRIAL"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    SUSPENDED = "SUSPENDED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class PaymentProvider(str, Enum):
    STRIPE = "stripe"
    PAYSTACK = "paystack"


class LimitedResource(str, Enum):
    """Things a plan can cap. Used by is_within_plan_limit."""

    USERS = "users"
    DOCUMENTS = "documents"
    CRAWL_PAGES = "crawl_pages"
    MONTHLY_MESSAGES = "monthly_messages"
    WIDGET_DOMAINS = "widget_domains"


class PlanLimits(BaseModel):
    """One field per LimitedResource, named exactly like its value."""

    users: int = Field(ge=1)
    documents: int = Field(ge=0)
    crawl_pages: int = Field(ge=0)
    monthly_messages: int = Field(ge=0)
    widget_domains: int = Field(ge=1)


class PlanDefinition(BaseModel):
    plan_id: str
    name: str
    limits: PlanLimits


# ---------------------------------------------------------------------------
# Usage — live resource consumption for a tenant
# ---------------------------------------------------------------------------


class UsageSummary(BaseModel):
    """Current resource consumption returned alongside entitlement limits.

    Monthly counters (crawl_pages_this_month, monthly_messages_this_month)
    reset at the start of each calendar month. The other counters reflect
    the live count at query time.
    """

    users: int = 0
    documents: int = 0
    crawl_pages_this_month: int = 0
    monthly_messages_this_month: int = 0
    widget_domains: int = 0


# ---------------------------------------------------------------------------
# Subscription — GET /billing/{tenant_id}/subscription
# ---------------------------------------------------------------------------


class SubscriptionResponse(BaseModel):
    """API response shape for the subscription endpoint."""

    subscription_id: str
    tenant_id: str
    plan_id: str
    plan_name: str
    status: SubscriptionStatus
    # trial_end is populated during the TRIAL period.
    trial_end: datetime | None = None
    # current_period_end is populated once a paid subscription is active.
    current_period_end: datetime | None = None
    # provider is None while on trial (no payment provider selected yet).
    provider: PaymentProvider | None = None
    limits: PlanLimits
    usage: UsageSummary
    created_at: datetime


# ---------------------------------------------------------------------------
# Checkout — POST /billing/{tenant_id}/checkout
# ---------------------------------------------------------------------------


class CheckoutRequest(BaseModel):
    """Body for the checkout initiation endpoint."""

    provider: PaymentProvider
    # Tenants select a paid plan; trial → trial upgrade is not a checkout flow.
    plan_id: str = Field(..., description="Target plan ID, e.g. 'professional'")


class CheckoutResponse(BaseModel):
    """Redirect the client to this URL to complete payment."""

    checkout_url: str
    provider: PaymentProvider


# ---------------------------------------------------------------------------
# Invoices — GET /billing/{tenant_id}/invoices
# ---------------------------------------------------------------------------


class InvoiceItem(BaseModel):
    """A single normalized invoice record, provider-agnostic.

    amount_cents is always in the smallest unit of the given currency
    (e.g. cents for USD, kobo for NGN) so callers do not need to know
    each provider's precision convention.
    """

    id: str                          # provider-side invoice / transaction ID
    provider: PaymentProvider
    amount_cents: int                # smallest currency unit
    currency: str                    # ISO 4217 lowercase, e.g. "usd", "ngn"
    status: str                      # "paid" | "open" | "void" | "failed"
    date: datetime                   # invoice / payment date
    description: str | None = None
    pdf_url: str | None = None       # provider download link if available


class InvoiceListResponse(BaseModel):
    """Paginated invoice list response."""

    invoices: list[InvoiceItem]
    next_cursor: str | None = None