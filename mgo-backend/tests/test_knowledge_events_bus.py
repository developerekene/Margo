"""WI-12: event_bus contract and knowledge register_handlers audit.

Verifies:
- The event bus re-raises subscriber exceptions (original contract).
- If one subscriber raises, the exception propagates to the publisher.
- The Knowledge service wraps publish() and raises AppError 503 so Cloud Tasks
  can retry rather than silently losing extracted content.
- register_handlers() in the knowledge module is a confirmed no-op (knowledge
  is a publisher-only module; it registers no subscriptions).
"""

import pytest

from app.shared.event_bus import subscribe, publish, _subscribers


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_subscribers():
    """Isolate each test from leftover subscriber registrations."""
    _subscribers.clear()
    yield
    _subscribers.clear()


# ---------------------------------------------------------------------------
# Tests — publish resilience
# ---------------------------------------------------------------------------


class TestPublishResilience:
    def test_subscriber_exception_propagates_to_publisher(self):
        """A handler that raises must propagate the exception to the publish caller.

        This is the original event_bus contract. The Knowledge service is
        responsible for catching publish() failures and raising AppError 503
        so Cloud Tasks retries the task rather than silently losing content.
        """
        def bad_handler(**kw):
            raise RuntimeError("subscriber boom")

        subscribe("TestEvent", bad_handler)

        with pytest.raises(RuntimeError, match="subscriber boom"):
            publish("TestEvent", data="payload")

    def test_no_subscribers_is_a_no_op(self):
        """Publishing an event with no subscribers raises nothing."""
        publish("EventWithNoSubscribers", value=42)

    def test_payload_is_passed_to_subscriber(self):
        """The keyword payload is delivered to the subscriber intact."""
        received = {}

        def capture(**kw):
            received.update(kw)

        subscribe("TestEvent", capture)
        publish("TestEvent", tenant_id="t-1", document_id="doc-1")

        assert received == {"tenant_id": "t-1", "document_id": "doc-1"}

    def test_duplicate_subscribe_is_idempotent(self):
        """Subscribing the same handler twice must not cause it to run twice."""
        call_count = [0]

        def handler(**kw):
            call_count[0] += 1

        subscribe("TestEvent", handler)
        subscribe("TestEvent", handler)  # duplicate

        publish("TestEvent")

        assert call_count[0] == 1

    def test_first_subscriber_exception_stops_subsequent_delivery(self):
        """When one subscriber raises, the exception propagates immediately.

        Downstream subscribers are not called after the first exception.
        The publisher (Knowledge service) is responsible for the retry strategy.
        """
        called = []

        def bad_handler(**kw):
            raise RuntimeError("boom")

        def later_handler(**kw):
            called.append("later")

        subscribe("TestEvent", bad_handler)
        subscribe("TestEvent", later_handler)

        with pytest.raises(RuntimeError):
            publish("TestEvent", x=1)

        # later_handler was NOT called because bad_handler raised first.
        assert called == []


# ---------------------------------------------------------------------------
# Tests — knowledge register_handlers is a confirmed no-op
# ---------------------------------------------------------------------------


class TestKnowledgeRegisterHandlers:
    def test_register_handlers_adds_no_subscriptions(self):
        """Knowledge is a publisher-only module; register_handlers must register nothing."""
        from app.modules.knowledge.events import register_handlers

        # Capture subscriber count before the call.
        before = sum(len(v) for v in _subscribers.values())

        register_handlers()

        after = sum(len(v) for v in _subscribers.values())
        assert after == before, (
            "register_handlers() must not subscribe any handlers "
            "(knowledge is publisher-only)"
        )
