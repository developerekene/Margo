"""Billing data shapes shared by the service, ports and API."""

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