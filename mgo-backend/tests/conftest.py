"""Shared pytest fixtures."""

import pytest

from app.shared import container
from tests.fake_firestore import FakeDB


@pytest.fixture
def fake_db():
    """Register an in-memory Firestore for the duration of one test."""
    db = FakeDB()
    previous = container._db
    container.register_db(db)
    yield db
    container._db = previous