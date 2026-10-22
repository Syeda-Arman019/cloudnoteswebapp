"""Authentication routes: register, login, logout, current user."""

from flask import Blueprint, current_app, jsonify, request

from app.auth import client_ip, current_user, login_required
from app.services import auth_service

bp = Blueprint("auth", __name__)


@bp.post("/register")
def register():
    """Create an account, seed default categories, and start a session."""
    user = auth_service.register(request.get_json(silent=True))
    return jsonify({"user": user.serialize()}), 201


@bp.post("/login")
def login():
    limiter = current_app.login_limiter
    user = auth_service.login(
        request.get_json(silent=True), limiter=limiter, ip=client_ip()
    )
    return jsonify({"user": user.serialize()})


@bp.post("/logout")
def logout():
    auth_service.logout()
    return "", 204


@bp.get("/me")
@login_required
def me():
    user = current_user()
    return jsonify({"user": user.serialize()})
