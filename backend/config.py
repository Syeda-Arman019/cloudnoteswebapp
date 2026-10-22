"""
Application configuration.

All secrets and connection settings come from environment variables — nothing
sensitive is ever hard-coded. `.env` (git-ignored) is loaded by the app factory.

Three configurations exist:
  * DevelopmentConfig  — MySQL (or an explicitly provided dev DB)
  * TestingConfig      — an explicit test database (temporary SQLite file),
                         used ONLY by pytest; never production
  * ProductionConfig   — MySQL, hardened cookie/CORS settings
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# This module reads environment variables at import time (class-body
# evaluation), so backend/.env must be loaded HERE — before the classes are
# defined — or its values would be silently ignored. Real environment
# variables always win (override=False).
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

# Known-insecure signing key used ONLY as a last-resort development default.
# The app factory refuses to start production while the effective SECRET_KEY
# is this value (or any `change-me…` placeholder).
INSECURE_DEV_SECRET = "dev-only-insecure-secret-key"


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


class BaseConfig:
    SECRET_KEY = os.environ.get("SECRET_KEY") or INSECURE_DEV_SECRET
    SESSION_COOKIE_NAME = "cloudnotes_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _as_bool(os.environ.get("SESSION_COOKIE_SECURE"), False)
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_SECURE = _as_bool(os.environ.get("SESSION_COOKIE_SECURE"), False)

    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(
        hours=int(os.environ.get("SESSION_HOURS", "168"))
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get(
            "CORS_ORIGINS", "http://localhost:5173,http://localhost:4173"
        ).split(",")
        if origin.strip()
    ]

    LOGIN_RATE_LIMIT = int(os.environ.get("LOGIN_RATE_LIMIT", "10"))
    LOGIN_RATE_WINDOW = int(os.environ.get("LOGIN_RATE_WINDOW", "300"))

    MAX_CONTENT_LENGTH = 1 * 1024 * 1024  # reject oversized JSON bodies (1 MiB)
    JSON_SORT_KEYS = False
    PROPAGATE_EXCEPTIONS = False

    # Bound pagination defaults used by the notes API.
    NOTES_DEFAULT_PER_PAGE = 50
    NOTES_MAX_PER_PAGE = 100


class DevelopmentConfig(BaseConfig):
    FLASK_ENV = "development"
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or (
        "mysql+pymysql://root:@127.0.0.1:3306/cloudnotes?charset=utf8mb4"
    )


class TestingConfig(BaseConfig):
    FLASK_ENV = "testing"
    TESTING = True
    DEBUG = False
    # Explicitly test-only: a private temporary SQLite file (or a URL the
    # test runner provides). SQLite is NEVER the production database.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "TEST_DATABASE_URL", "sqlite:///cloudnotes-tests.db"
    )
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": False}
    WTF_CSRF_ENABLED = False
    LOGIN_RATE_LIMIT = 5
    LOGIN_RATE_WINDOW = 60


class ProductionConfig(BaseConfig):
    FLASK_ENV = "production"
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
    # Required in production; the app factory raises a clear error when it is
    # missing (evaluated lazily so importing this module never crashes).
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or ""
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_size": 10,
        "max_overflow": 20,
    }


CONFIG_BY_NAME = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}
