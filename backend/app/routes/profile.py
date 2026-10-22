"""Profile routes: view, update, change password, delete account."""

from flask import Blueprint, jsonify, request

from app.auth import current_user, login_required
from app.services import profile_service

bp = Blueprint("profile", __name__)


@bp.get("")
@login_required
def get_profile():
    user = current_user()
    return jsonify({"user": profile_service.get_profile(user)})


@bp.put("")
@login_required
def update_profile():
    user = current_user()
    updated = profile_service.update_profile(user, request.get_json(silent=True))
    return jsonify({"user": updated.serialize()})


@bp.post("/password")
@login_required
def change_password():
    user = current_user()
    updated = profile_service.change_password(user, request.get_json(silent=True))
    return jsonify({"user": updated.serialize()})


@bp.delete("")
@login_required
def delete_account():
    user = current_user()
    profile_service.delete_account(user, request.get_json(silent=True))
    return "", 204
