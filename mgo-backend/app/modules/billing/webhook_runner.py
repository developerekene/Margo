"""Idempotent, atomic webhook processing shared by every provider.

Flow for each delivery:
  1. claim_event: create billing_events/{provider}__{event_id}.
       - already 'processed'            -> DUPLICATE (ack, change nothing)
       - 'processing' and lock is fresh -> BUSY (another worker has it)
       - new / 'failed' / stale lock    -> CLAIMED
  2. The handler queues its writes on a Firestore batch.
  3. The 'processed' marker is added to the SAME batch, so the effects and
     the marker commit atomically. A crash before commit leaves nothing
     half-applied and the provider's retry runs the handler again.
  4. On any error the event is marked 'failed' and the error is re-raised,
     so the API answers non-2xx and the provider retries.

Only the event type and error class name are stored - never the payload.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from enum import Enum

from google.api_core.exceptions import AlreadyExists

from app.core.responses import AppError
from app.modules.billing.constants import BILLING_EVENTS
from app.shared.container import get_db

logger = logging.getLogger("margo")

# How long a 'processing' claim blocks other deliveries of the same event.
PROCESSING_LOCK_SECONDS = 300


class ClaimResult(str, Enum):
    CLAIMED = "claimed"
    DUPLICATE = "duplicate"
    BUSY = "busy"


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def claim_event(db, provider: str, event_id: str, event_type: str) -> ClaimResult:
    """Try to take ownership of processing this event."""
    ref = db.collection(BILLING_EVENTS).document(f"{provider}__{event_id}")
    now = datetime.now(UTC)
    lock_until = now + timedelta(seconds=PROCESSING_LOCK_SECONDS)
    try:
        ref.create(
            {
                "provider": provider,
                "event_id": event_id,
                "event_type": event_type,
                "status": "processing",
                "attempts": 1,
                "received_at": now,
                "lock_until": lock_until,
            }
        )
        return ClaimResult.CLAIMED
    except AlreadyExists:
        pass

    data = ref.get().to_dict() or {}
    status = data.get("status")
    if status == "processed":
        return ClaimResult.DUPLICATE
    held_until = data.get("lock_until")
    if status == "processing" and held_until and _utc(held_until) > now:
        return ClaimResult.BUSY

    ref.update(
        {
            "status": "processing",
            "attempts": data.get("attempts", 0) + 1,
            "lock_until": lock_until,
        }
    )
    return ClaimResult.CLAIMED


def run_idempotent(
    provider: str,
    event_id: str,
    event_type: str,
    apply: Callable,
) -> str:
    """Process one webhook delivery. Returns 'processed' or 'duplicate'.

    `apply(db, batch)` queues the event's writes on `batch`; it must not
    commit. Raises on failure so the caller can answer non-2xx.
    """
    db = get_db()
    claim = claim_event(db, provider, event_id, event_type)
    if claim == ClaimResult.DUPLICATE:
        logger.info("Webhook duplicate ignored: %s %s", provider, event_id)
        return "duplicate"
    if claim == ClaimResult.BUSY:
        raise AppError(
            code="webhook_in_progress",
            message="This event is already being processed.",
            status_code=409,
        )

    ref = db.collection(BILLING_EVENTS).document(f"{provider}__{event_id}")
    try:
        batch = db.batch()
        apply(db, batch)
        batch.update(
            ref,
            {
                "status": "processed",
                "processed_at": datetime.now(UTC),
                "lock_until": None,
                "error": None,
            },
        )
        batch.commit()
    except Exception as exc:
        try:
            ref.update(
                {
                    "status": "failed",
                    "error": type(exc).__name__,
                    "lock_until": None,
                }
            )
        except Exception:
            logger.exception("Could not mark webhook event failed")
        raise
    return "processed"