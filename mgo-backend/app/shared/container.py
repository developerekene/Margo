"""app.shared.container - service locator for infrastructure clients.

Modules outside identity cannot import app.core.firebase (import linter rule).
This container is the sanctioned way for them to access shared infrastructure
like Firestore.  The composition root registers the client at startup.
"""
from __future__ import annotations

from typing import Any

_db: Any = None


def register_db(client: Any) -> None:
    """Register the Firestore client.  Called once at application startup."""
    global _db
    _db = client


def get_db() -> Any:
    """Return the registered Firestore client.

    Raises RuntimeError if called before register_db - this is a startup
    wiring error, not a runtime user error.
    """
    if _db is None:
        raise RuntimeError(
            "Firestore client has not been registered. "
            "Call container.register_db(client) at application startup."
        )
    return _db
