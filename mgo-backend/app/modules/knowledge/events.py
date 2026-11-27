"""Knowledge module event subscriptions and event emitters.

Call register_handlers() once at application startup (in app/main.py lifespan)
to wire the knowledge module into the domain event bus.

Currently published events (knowledge -> embedding):
  PageExtracted     {tenant_id, url, title, content}
  DocumentExtracted {tenant_id, document_id, source_type, title, content}
  DocumentDeleted   {tenant_id, document_id}

Currently subscribed events:
  None yet — knowledge is a publisher, not a subscriber.
"""



def register_handlers() -> None:
    """Subscribe knowledge handlers to domain events.

    Currently a no-op for subscriptions: knowledge publishes events but does
    not yet subscribe to any. The function exists so app/main.py can call it
    consistently with the billing module pattern, and so future subscriptions
    can be added here without touching main.py.
    """
    # Future: subscribe("EmbeddingCompleted", _on_embedding_completed)
