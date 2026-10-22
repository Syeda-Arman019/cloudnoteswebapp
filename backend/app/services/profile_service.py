"""Profile service: view, rename, change password, delete account."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth import login_user_session, logout_user_session
from app.errors import ApiError
from app.extensions import db
from app.models import User
from app.validation import (
    require_json_object,
    validate_full_name,
    validate_password,
)


def get_profile(user):
    return user.serialize()


def update_profile(user, payload):
    data = require_json_object(payload)
    user.full_name = validate_full_name(data.get("fullName"))
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        raise ApiError("Could not save the profile.", 409) from None
    db.session.commit()
    return user


def change_password(user, payload, *, keep_session=True):
    """
    Verify the current password, set the new one, and bump session_version
    so every OTHER session is invalidated immediately. The current session
    is re-issued with the new version so the user stays signed in.
    """
    data = require_json_object(payload)
    current = str(data.get("currentPassword") or "")
    new_password = validate_password(data.get("newPassword"), field="newPassword")

    if not current:
        raise ApiError("Enter your current password.", 422, details={"field": "currentPassword"})
    if not user.check_password(current):
        raise ApiError("Current password is incorrect.", 400, details={"field": "currentPassword"})
    if current == new_password:
        raise ApiError(
            "New password must be different from the current one.",
            422,
            details={"field": "newPassword"},
        )

    user.set_password(new_password)
    user.session_version = (user.session_version or 1) + 1
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        raise ApiError("Could not update the password.", 500) from None
    db.session.commit()

    if keep_session:
        login_user_session(user)
    return user


def delete_account(user, payload=None):
    """
    Delete the signed-in user's account and all owned data (notes,
    categories, tags, associations). Requires the current password as the
    final server-side authorization for an irreversible action.
    """
    data = require_json_object(payload or {})
    password = str(data.get("password") or "")
    if not password:
        raise ApiError("Enter your password to confirm deletion.", 422, details={"field": "password"})
    if not user.check_password(password):
        raise ApiError("Password is incorrect.", 400, details={"field": "password"})

    logout_user_session()
    db.session.delete(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise ApiError("Could not delete the account.", 500) from None
    return True


def email_taken(email, exclude_user_id=None):
    query = select(User.id).where(func.lower(User.email) == str(email).strip().lower())
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    return db.session.scalar(query) is not None
