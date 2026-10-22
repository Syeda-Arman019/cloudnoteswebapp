"""
Pytest fixtures.

The test database is an explicit, private temporary SQLite file created
before the app module is imported (SQLite is the TEST configuration only —
MySQL remains the intended production database; see docs/database-guide.md).
The schema is rebuilt and the login limiter reset before every test, so no
test can observe another test's data.
"""

import os
import tempfile
import uuid

_TMP_DIR = tempfile.mkdtemp(prefix="cloudnotes-tests-")
os.environ["TEST_DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP_DIR, "test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402


@pytest.fixture(scope="session")
def app():
    application = create_app("testing")
    yield application


@pytest.fixture(autouse=True)
def fresh_database(app):
    with app.app_context():
        db.drop_all()
        db.create_all()
    app.login_limiter.reset()
    yield


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def app_context(app):
    with app.app_context():
        yield


def register_user(client, email=None, password="secret123", full_name="Test User"):
    """Register through the real API and return (response, email, password)."""
    email = email or f"user-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"fullName": full_name, "email": email, "password": password},
    )
    return response, email, password


def create_note(client, title="Sample note", content="Some **content**", **extra):
    payload = {"title": title, "content": content, "tags": [], "categoryId": None}
    payload.update(extra)
    return client.post("/api/notes", json=payload)
