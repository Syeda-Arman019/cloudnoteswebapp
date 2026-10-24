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
from io import BytesIO

_TMP_DIR = tempfile.mkdtemp(prefix="cloudnotes-tests-")
os.environ["TEST_DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP_DIR, "test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
# Isolated upload store per test run (config reads this at import time).
_UPLOAD_DIR = tempfile.mkdtemp(prefix="cloudnotes-uploads-")
os.environ["UPLOAD_FOLDER"] = _UPLOAD_DIR

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
    # Part 2 limiters are per-process singletons too — reset them so one
    # test's invitation/message/upload attempts never rate-limit the next.
    app.invite_limiter.reset()
    app.message_limiter.reset()
    app.upload_limiter.reset()
    yield


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def app_context(app):
    with app.app_context():
        yield


@pytest.fixture
def owner(app):
    """Signed-in class owner with its OWN independent client session
    (Part 2 fixtures: two users must never share one cookie jar)."""
    c = app.test_client()
    response, _, _ = register_user(c, full_name="Class Owner")
    assert response.status_code == 201
    return c


@pytest.fixture
def member(app):
    """A second signed-in student with an independent session."""
    return app.test_client()


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


# Minimal valid file heads for upload tests (match file_validation.py).
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
DOCX_BYTES = b"PK\x03\x04" + b"\x00" * 64
TXT_BYTES = b"Hello lecture notes.\n"


def upload_file(
    client,
    name="lecture-notes.pdf",
    content=PDF_BYTES,
    folder_id=None,
):
    """POST one multipart upload exactly like the frontend does."""
    data = {"file": (BytesIO(content), name)}
    if folder_id is not None:
        data["folderId"] = str(folder_id)
    return client.post("/api/files", data=data, content_type="multipart/form-data")
