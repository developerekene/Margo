"""A tiny in-memory stand-in for the Firestore client, for billing tests.

It implements only what the billing module uses: collections, documents,
sub-collections, create/set/update/get, where('==')/order_by/start_after/
limit queries, batches, and Increment. Behaviour matches Firestore where the
tests depend on it (create() raises AlreadyExists; a batch applies all its
writes only on commit()).
"""

import copy
from datetime import UTC, datetime, timedelta

from google.api_core.exceptions import AlreadyExists, NotFound
from google.cloud.firestore_v1 import Increment

from app.modules.billing.schemas import SubscriptionStatus


def _apply(base: dict, data: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in data.items():
        if isinstance(value, Increment):
            result[key] = result.get(key, 0) + value.value
        else:
            result[key] = value
    return result


class FakeSnapshot:
    def __init__(self, ref, data):
        self.reference = ref
        self.id = ref.id
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return None if self._data is None else copy.deepcopy(self._data)


class FakeDocRef:
    def __init__(self, db, path):
        self._db = db
        self.path = path

    @property
    def id(self):
        return self.path.rsplit("/", 1)[-1]

    def collection(self, name):
        return FakeCollection(self._db, f"{self.path}/{name}")

    def get(self, transaction=None):
        return FakeSnapshot(self, self._db.store.get(self.path))

    def create(self, data):
        if self.path in self._db.store:
            raise AlreadyExists("document already exists")
        self._db.store[self.path] = _apply({}, data)

    def set(self, data, merge=False):
        base = self._db.store.get(self.path, {}) if merge else {}
        self._db.store[self.path] = _apply(base, data)

    def update(self, data):
        if self.path not in self._db.store:
            raise NotFound("no document to update")
        self._db.store[self.path] = _apply(self._db.store[self.path], data)


class FakeQuery:
    def __init__(self, collection, filters=(), order=None, after=None, limit=None):
        self._collection = collection
        self._filters = list(filters)
        self._order = order
        self._after = after
        self._limit = limit

    def where(self, field, op, value):
        assert op == "=="
        return FakeQuery(
            self._collection,
            self._filters + [(field, value)],
            self._order, self._after, self._limit,
        )

    def order_by(self, field, direction="ASCENDING"):
        return FakeQuery(
            self._collection, self._filters, (field, direction),
            self._after, self._limit,
        )

    def start_after(self, values):
        return FakeQuery(
            self._collection, self._filters, self._order, values, self._limit
        )

    def limit(self, n):
        return FakeQuery(
            self._collection, self._filters, self._order, self._after, n
        )

    def get(self):
        docs = self._collection._children()
        for field, value in self._filters:
            docs = [d for d in docs if d.to_dict().get(field) == value]
        if self._order:
            field, direction = self._order

            def key(d):
                return (d.to_dict()[field], d.id)  # document id breaks ties

            docs.sort(key=key, reverse=(direction == "DESCENDING"))
            if self._after is not None:
                anchor = key(self._after)  # start_after(snapshot)
                if direction == "DESCENDING":
                    docs = [d for d in docs if key(d) < anchor]
                else:
                    docs = [d for d in docs if key(d) > anchor]
        if self._limit is not None:
            docs = docs[: self._limit]
        return docs


class FakeCollection(FakeQuery):
    def __init__(self, db, path):
        self._db = db
        self.path = path
        super().__init__(self)

    def document(self, doc_id):
        return FakeDocRef(self._db, f"{self.path}/{doc_id}")

    def _children(self):
        prefix = self.path + "/"
        out = []
        for key in sorted(self._db.store):
            if key.startswith(prefix) and "/" not in key[len(prefix):]:
                out.append(FakeSnapshot(FakeDocRef(self._db, key), self._db.store[key]))
        return out


class FakeBatch:
    def __init__(self):
        self._ops = []

    def set(self, ref, data, merge=False):
        self._ops.append(("set", ref, data, merge))

    def update(self, ref, data):
        self._ops.append(("update", ref, data, False))

    def commit(self):
        for op, ref, data, merge in self._ops:
            if op == "set":
                ref.set(data, merge=merge)
            else:
                ref.update(data)
        self._ops = []


class FakeTransaction:
    def set(self, ref, data, merge=False):
        ref.set(data, merge=merge)


class FakeDB:
    def __init__(self):
        self.store: dict[str, dict] = {}

    def collection(self, name):
        return FakeCollection(self, name)

    def batch(self):
        return FakeBatch()

    def transaction(self):
        return FakeTransaction()

    # test helpers -----------------------------------------------------------
    def doc(self, path):
        """Return the stored dict at a document path, or None."""
        return copy.deepcopy(self.store.get(path))

    def put(self, path, data):
        self.store[path] = copy.deepcopy(data)


def subscription_doc(tenant_id="t-1", **overrides):
    """A subscription record as the billing module stores it."""
    now = datetime.now(UTC)
    doc = {
        "subscription_id": tenant_id,
        "tenant_id": tenant_id,
        "plan_id": "starter",
        "status": SubscriptionStatus.TRIAL.value,
        "trial_end": now + timedelta(days=14),
        "created_at": now,
        "updated_at": now,
    }
    doc.update(overrides)
    return doc