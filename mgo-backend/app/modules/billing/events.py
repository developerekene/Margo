"""Billing event subscriptions.

Call register_handlers() once at application startup to wire billing
into the domain event bus.
"""
from app.modules.billing import service as billing_service
from app.shared.event_bus import subscribe


def register_handlers() -> None:
    """Subscribe billing handlers to domain events."""
    subscribe("TenantRegistered", billing_service.create_trial_subscription)
