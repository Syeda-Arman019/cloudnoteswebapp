"""
Session-based authentication.

Strategy: Flask's signed, HttpOnly session cookie carries only
`{"uid": <user id>, "sv": <session version>}` — no tokens ever reach
localStorage or JavaScript. The server validates the user and version on
every request, so bumping `session_version` instantly invalidates every
existing cookie (logout-all, password change, account deletion).

Cookie hardening (HttpOnly, SameSite=Lax, Secure in production) lives in
config.py; mutations additionally require an allowed Origin header (CSRF
belt-and-braces on top of SameSite).
"""

from functools import wraps

from flask import g, has_request_context, request, session

from app.errors import ApiError


def session_payload(user):
    return {"uid": user.id, "sv": user.session_version}


def login_user_session(user, *, permanent=True):
    session.clear()
    session["user"] = session_payload(user)
    session.permanent = bool(permanent)


def logout_user_session():
    session.clear()


def current_user():
    """
    Resolve the authenticated user for this request (or None).

    Loads once per request, rejects cookies whose session_version no longer
    matches (expired/revoked sessions), and stores the result on `g`.
    """
    if not has_request_context():
        return None
    if hasattr(g, "_current_user"):
        return g._current_user

    g._current_user = None
    payload = session.get("user")
    if not payload or "uid" not in payload:
        return None

    from app.models import User  # local import avoids a circular import
    from app.extensions import db

    user = db.session.get(User, payload.get("uid"))
    if user is None or payload.get("sv") != user.session_version:
        logout_user_session()
        return None

    g._current_user = user
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError("You must be signed in to do that.", 401)
        return fn(*args, **kwargs)

    return wrapper


def client_ip():
    """Best-effort client address (respects a single trusted proxy header)."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"
