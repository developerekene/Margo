"""Firestore collection names used by the billing module."""

SUBSCRIPTIONS = "subscriptions"
BILLING_EVENTS = "billing_events"
INVOICES = "billing_invoices"  # billing_invoices/{tenant_id}/items/{invoice}
USAGE_COUNTERS = "usage_counters"