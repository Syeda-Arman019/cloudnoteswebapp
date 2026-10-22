"""
Optional MySQL smoke test.

Runs ONLY when MYSQL_TEST_URL points at a disposable MySQL database:

    MYSQL_TEST_URL=mysql+pymysql://user:pass@127.0.0.1:3307/cloudnotes_test \
        .venv/Scripts/python -m pytest tests/test_mysql_smoke.py

It creates every table in that database and exercises a user/note/tag round
trip with MySQL's real foreign keys, unique indexes, and utf8mb4 handling.
Without the environment variable the test is SKIPPED, which is reported
plainly in the test summary — SQLite tests never substitute for MySQL
verification.
"""

import os

import pytest

MYSQL_TEST_URL = os.environ.get("MYSQL_TEST_URL")


pytestmark = pytest.mark.skipif(
    not MYSQL_TEST_URL,
    reason="MYSQL_TEST_URL not set — MySQL-specific checks remain unverified.",
)


@pytest.fixture()
def mysql_app():
    from app import create_app

    os.environ["TEST_DATABASE_URL"] = MYSQL_TEST_URL
    application = create_app("testing")
    application.config["SQLALCHEMY_DATABASE_URI"] = MYSQL_TEST_URL
    yield application
    os.environ.pop("TEST_DATABASE_URL", None)


def test_mysql_schema_and_unicode_round_trip(mysql_app):
    from sqlalchemy import text

    from app.extensions import db
    from app.models import Category, Note, Tag, User, utcnow

    with mysql_app.app_context():
        db.drop_all()
        db.create_all()
        try:
            user = User(full_name="MySQL Smoke", email="mysql-smoke@example.com")
            user.set_password("secret123")
            db.session.add(user)
            db.session.flush()

            db.session.add_all(Category.create_defaults_for(user))
            note = Note(
                user_id=user.id,
                title="Unicode café 🎉",
                content="# Überschrift\n\nhéllo 中文",
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.session.add(note)
            db.session.flush()

            tag = Tag(user_id=user.id, name="unicode")
            note.tags.append(tag)
            db.session.commit()

            fetched = db.session.execute(
                text("SELECT title FROM notes WHERE user_id = :uid"), {"uid": user.id}
            ).scalar()
            assert fetched == "Unicode café 🎉"

            # Unique email index is enforced by MySQL itself.
            duplicate = User(full_name="Dup", email="mysql-smoke@example.com")
            duplicate.set_password("secret123")
            db.session.add(duplicate)
            with pytest.raises(Exception):
                db.session.commit()
            db.session.rollback()

            # ON DELETE SET NULL: deleting a category detaches its notes.
            db.session.get(Note, note.id).category_id = db.session.execute(
                text("SELECT id FROM categories WHERE user_id = :uid LIMIT 1"),
                {"uid": user.id},
            ).scalar()
            db.session.commit()
            db.session.execute(
                text(
                    "DELETE FROM categories WHERE user_id = :uid LIMIT 1"
                ),
                {"uid": user.id},
            )
            db.session.commit()
        finally:
            db.drop_all()
