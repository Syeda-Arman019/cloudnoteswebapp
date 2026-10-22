"""Categories and tags routes."""

from flask import Blueprint, jsonify, request

from app.auth import current_user, login_required
from app.services import category_service

bp = Blueprint("categories", __name__)


@bp.get("/categories")
@login_required
def list_categories():
    user = current_user()
    return jsonify(category_service.list_categories(user))


@bp.post("/categories")
@login_required
def create_category():
    user = current_user()
    category = category_service.create_category(user, request.get_json(silent=True))
    return jsonify({"category": category}), 201


@bp.put("/categories/<int:category_id>")
@login_required
def update_category(category_id):
    user = current_user()
    category = category_service.update_category(
        user, category_id, request.get_json(silent=True)
    )
    return jsonify({"category": category})


@bp.delete("/categories/<int:category_id>")
@login_required
def delete_category(category_id):
    user = current_user()
    category_service.delete_category(user, category_id)
    return "", 204


@bp.get("/tags")
@login_required
def list_tags():
    user = current_user()
    return jsonify(category_service.list_tags(user))
