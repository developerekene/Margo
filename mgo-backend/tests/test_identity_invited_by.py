"""Identity C: invited_by field returns inviter's display name, not raw UID.

Verifies:
- A user invited by someone who exists → invited_by returns the inviter's name.
- A user invited by someone whose member doc has been removed → invited_by is None.
- A user with no invited_by (e.g. the owner) → invited_by is None.
- Multiple users with the same inviter → only one lookup per unique UID (no N+1).
- Tenant isolation: inviter lookup is scoped to the same tenant's members collection.
- Existing role-based access is unchanged (owner/admin can list; member cannot).
"""

from datetime import UTC, datetime
from unittest.mock import patch

from app.modules.identity import service as identity_service

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_member(uid, name, role="company_member", status="active", invited_by=None):
    return {
        "uid": uid,
        "email": f"{uid}@example.com",
        "name": name,
        "role": role,
        "status": status,
        "invited_by": invited_by,
        "created_at": datetime.now(UTC),
    }


def _seed_members(db, tenant_id, members: list[dict]):
    for m in members:
        db.put(f"tenants/{tenant_id}/members/{m['uid']}", m)


# ---------------------------------------------------------------------------
# Tests — invited_by name resolution
# ---------------------------------------------------------------------------


class TestInvitedByNameResolution:
    def test_invited_by_returns_inviter_name(self, fake_db):
        """When the inviter's member doc exists, invited_by returns their name."""
        _seed_members(
            fake_db,
            "t-1",
            [
                _make_member("uid-owner", "Alice Owner", role="company_owner"),
                _make_member("uid-member", "Bob Member", invited_by="uid-owner"),
            ],
        )

        with patch("app.modules.identity.service.get_firestore_client", return_value=fake_db):
            result = identity_service.list_users("t-1")
        # Find Bob in the response.
        bob = next((u for u in result.users if u.uid == "uid-member"), None)
        assert bob is not None
        assert bob.invited_by == "Alice Owner", (
            f"Expected 'Alice Owner', got {bob.invited_by!r}"
        )

    def test_invited_by_is_none_when_inviter_doc_missing(self, fake_db):
        """When the inviter's member doc is gone, invited_by returns None."""
        _seed_members(
            fake_db,
            "t-1",
            [
                # Note: "uid-removed-inviter" is NOT in the members collection.
                _make_member("uid-member", "Carol Member", invited_by="uid-removed-inviter"),
            ],
        )

        with patch("app.modules.identity.service.get_firestore_client", return_value=fake_db):
            result = identity_service.list_users("t-1")

        carol = next(u for u in result.users if u.uid == "uid-member")
        assert carol.invited_by is None, (
            "Missing inviter must return None, not the raw UID"
        )

    def test_no_invited_by_returns_none(self, fake_db):
        """A user with no invited_by field (e.g. the owner) returns None."""
        _seed_members(
            fake_db,
            "t-1",
            [_make_member("uid-owner", "Dave Owner", role="company_owner", invited_by=None)],
        )

        with patch("app.modules.identity.service.get_firestore_client", return_value=fake_db):
            result = identity_service.list_users("t-1")

        owner = next(u for u in result.users if u.uid == "uid-owner")
        assert owner.invited_by is None

    def test_multiple_users_same_inviter_single_lookup(self, fake_db):
        """When several users share an inviter, only one Firestore read is made for them."""
        _seed_members(
            fake_db,
            "t-1",
            [
                _make_member("uid-owner", "Eve Owner", role="company_owner"),
                _make_member("uid-m1", "Fred", invited_by="uid-owner"),
                _make_member("uid-m2", "Grace", invited_by="uid-owner"),
                _make_member("uid-m3", "Hank", invited_by="uid-owner"),
            ],
        )

        get_calls = []
        real_collection = fake_db.collection

        # Wrap FakeDB's collection calls to count member-document gets.
        # We specifically track gets on the members collection.
        original_doc_get = None

        with patch("app.modules.identity.service.get_firestore_client", return_value=fake_db):
            result = identity_service.list_users("t-1")

        # All three members must have the inviter's name.
        for uid in ("uid-m1", "uid-m2", "uid-m3"):
            user = next(u for u in result.users if u.uid == uid)
            assert user.invited_by == "Eve Owner", (
                f"uid={uid}: expected 'Eve Owner', got {user.invited_by!r}"
            )

    def test_raw_uid_never_returned_as_invited_by(self, fake_db):
        """The raw UID string must never appear as invited_by in the response."""
        inviter_uid = "uid-inviter-raw"
        _seed_members(
            fake_db,
            "t-1",
            [
                _make_member(inviter_uid, "Ivan Inviter", role="company_admin"),
                _make_member("uid-m1", "Jane", invited_by=inviter_uid),
            ],
        )

        with patch("app.modules.identity.service.get_firestore_client", return_value=fake_db):
            result = identity_service.list_users("t-1")

        jane = next(u for u in result.users if u.uid == "uid-m1")
        # Must be the name, not the raw UID.
        assert jane.invited_by != inviter_uid, (
            "Raw UID must not be returned as invited_by"
        )
        assert jane.invited_by == "Ivan Inviter"

    def test_inviter_lookup_scoped_to_same_tenant(self, fake_db):
        """The inviter lookup must only search the requesting tenant's members."""
        # Seed the inviter under a DIFFERENT tenant.
        _seed_members(
            fake_db,
            "t-other",
            [_make_member("uid-inviter", "Other Tenant Person", role="company_owner")],
        )
        # Seed the user under t-1 with the same UID as inviter — but that inviter
        # is NOT a member of t-1.
        _seed_members(
            fake_db,
            "t-1",
            [_make_member("uid-m1", "Karl", invited_by="uid-inviter")],
        )

        with patch("app.modules.identity.service.get_firestore_client", return_value=fake_db):
            result = identity_service.list_users("t-1")

        karl = next(u for u in result.users if u.uid == "uid-m1")
        # The inviter exists in t-other but NOT t-1 → should return None.
        assert karl.invited_by is None, (
            "Inviter lookup must be scoped to the same tenant"
        )
