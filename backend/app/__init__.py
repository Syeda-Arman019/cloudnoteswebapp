"""
Application factory.

    app = create_app()          # config chosen by FLASK_ENV
    app = create_app("testing") # explicit config (used by pytest)

Responsibilities:
  * load `.env` (git-ignored) without overriding real environment variables
  * initialize SQLAlchemy, Flask-Migrate, and restricted CORS
  * register JSON error handlers and blueprints
  * enforce a same-origin check on mutating requests (CSRF belt-and-braces
    on top of the SameSite session cookie)
  * enable foreign keys on SQLite connections (test configuration only —
    MySQL enforces FKs natively)
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from config import CONFIG_BY_NAME, INSECURE_DEV_SECRET
from app.errors import register_error_handlers
from app.extensions import cors, db, migrate
from app.rate_limit import SlidingWindowLimiter
from app.routes import register_blueprints

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def create_app(config_name=None):
    # Load backend/.env (and the real environment always wins).
    load_dotenv(BACKEND_ROOT / ".env", override=False)

    config_name = config_name or os.environ.get("FLASK_ENV", "development")
    if config_name not in CONFIG_BY_NAME:
        config_name = "development"

    if config_name == "production" and not os.environ.get("DATABASE_URL"):
        raise RuntimeError(
            "DATABASE_URL must be set in production "
            "(e.g. mysql+pymysql://user:password@host:3306/cloudnotes?charset=utf8mb4)."
        )

    app = Flask(__name__)
    app.config.from_object(CONFIG_BY_NAME[config_name])

    secret = app.config.get("SECRET_KEY")
    if (
        not secret
        or secret == INSECURE_DEV_SECRET
        or str(secret).startswith("change-me")
    ):
        if app.config.get("TESTING") or config_name == "development":
            app.logger.warning(
                "SECRET_KEY is not set — using the insecure development default."
            )
        else:
            raise RuntimeError(
                "SECRET_KEY must be set to a long random value in production."
            )

    _init_extensions(app)
    _init_sqlite_pragmas(app)
    _init_security(app)
    register_error_handlers(app)
    register_blueprints(app)
    _register_cli(app)

    @app.get("/api/health")
    def health():
        """Liveness probe used by local checks and deployment smoke tests."""
        try:
            from sqlalchemy import text

            db.session.execute(text("SELECT 1"))
            database = "up"
        except Exception:  # pragma: no cover - reported as degraded health
            database = "down"
        return jsonify(
            {
                "status": "ok" if database == "up" else "degraded",
                "service": "cloudnotes-api",
                "database": database,
                "environment": config_name,
            }
        ), (200 if database == "up" else 503)

    return app


def _init_extensions(app):
    db.init_app(app)
    migrate.init_app(app, db, compare_type=True)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
        allow_headers=["Content-Type"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )
    app.json.sort_keys = False
    # Import models so Alembic and db.create_all() see every table.
    from app import models  # noqa: F401


def _init_sqlite_pragmas(app):
    """SQLite (test/dev only) must be told to enforce foreign keys."""
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    uri = str(app.config.get("SQLALCHEMY_DATABASE_URI", ""))
    if not uri.startswith("sqlite"):
        return  # MySQL enforces foreign keys natively

    @event.listens_for(Engine, "connect")
    def _fk_on_connect(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _init_security(app):
    """Same-origin guard for mutating requests + per-process login limiter."""
    allowed = set(app.config["CORS_ORIGINS"])

    @app.before_request
    def _verify_origin():
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return None
        origin = request.headers.get("Origin")
        if origin is None:
            # Non-browser clients (tests, curl) send no Origin; the session
            # cookie's SameSite=Lax policy still blocks cross-site writes.
            return None
        same_origin = f"http://{request.host}" if request.host else None
        if origin in allowed or origin == same_origin or (same_origin and origin.rstrip("/") == same_origin.rstrip("/")):
            return None
        return jsonify({"message": "Request origin is not allowed.", "code": "forbidden"}), 403

    app.login_limiter = SlidingWindowLimiter(
        max_attempts=app.config["LOGIN_RATE_LIMIT"],
        window_seconds=app.config["LOGIN_RATE_WINDOW"],
    )
    # Part 2: per-user limiters for invitations/joins, chat sends and
    # attachment uploads (single-process, same as the login limiter).
    app.invite_limiter = SlidingWindowLimiter(
        max_attempts=app.config.get("INVITE_RATE_LIMIT", 20),
        window_seconds=app.config.get("INVITE_RATE_WINDOW", 3600),
    )
    app.message_limiter = SlidingWindowLimiter(
        max_attempts=app.config.get("MESSAGE_RATE_LIMIT", 60),
        window_seconds=app.config.get("MESSAGE_RATE_WINDOW", 60),
    )
    app.upload_limiter = SlidingWindowLimiter(
        max_attempts=app.config.get("UPLOAD_RATE_LIMIT", 40),
        window_seconds=app.config.get("UPLOAD_RATE_WINDOW", 60),
    )


def _register_cli(app):
    @app.cli.command("create-tables")
    def create_tables():
        """Create all tables directly (development convenience only)."""
        db.create_all()
        print("Tables created.", file=sys.stdout)
