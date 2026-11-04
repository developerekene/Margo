from collections import defaultdict
from collections.abc import Callable

_subscribers: dict[str, list[Callable]] = defaultdict(list)


def subscribe(event_name: str, handler: Callable):
    _subscribers[event_name].append(handler)


def publish(event_name: str, **payload):
    for handler in _subscribers.get(event_name, []):
        handler(**payload)
