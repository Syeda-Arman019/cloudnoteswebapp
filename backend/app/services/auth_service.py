"""Authentication service: registration, login, logout, current user."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth import login_user_session, logout_user_session, session_payload
from app.errors import ApiError
from app.extensions import db
from app.models import Category, User
from app.validation import (
    require_json_object,
    validate_email,
    validate_full_name,
    validate_password,
)


def register(payload):
    """Create a user, seed default categories, and start a session."""
    data = require_json_object(payload)
    full_name = validate_full_name(data.get("fullName"))
    email = validate_email(data.get("email"))
    password = validate_password(data.get("password"))

    existing = db.session.scalar(select(User).where(func.lower(User.email) == email))
    if existing:
        raise ApiError("An account with this email already exists.", 409)

    user = User(full_name=full_name, email=email, role="member")
    user.set_password(password)
    db.session.add_all(Category.create_defaults_for(user))

    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        raise ApiError("An account with this email already exists.", 409) from None

    db.session.commit()
    login_user_session(user)
    return user


def login(payload, *, limiter, ip):
    """
    Verify credentials and start a session.

    `limiter` is checked BEFORE password verification and reset on success;
    the response message never reveals whether the email exists.
    """
    data = require_json_object(payload)
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")

    if not email or not password:
        raise ApiError("Email and password are required.", 422)

    allowed, retry_after = limiter.check(f"{ip}|{email}")
    if not allowed:
        raise ApiError(
            f"Too many sign-in attempts. Try again in {retry_after} seconds.",
            429,
            code="rate_limited",
        )

    user = db.session.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not user.check_password(password):
        raise ApiError("Incorrect email or password.", 401, code="invalid_credentials")

    limiter.reset(f"{ip}|{email}")
    login_user_session(user)
    return user


def logout():
    logout_user_session()


def serialize_current(user):
    return {"user": user.serialize()}


def session_cookie_payload(user):
    return session_payload(user)
