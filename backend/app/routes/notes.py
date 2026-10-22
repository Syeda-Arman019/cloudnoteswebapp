"""Notes routes: list/create/read/update/delete/pin plus dashboard stats."""

from flask import Blueprint, jsonify, request

from app.auth import current_user, login_required
from app.services import category_service, note_service

bp = Blueprint("notes", __name__)


@bp.get("/notes")
@login_required
def list_notes():
    user = current_user()
    return jsonify(note_service.list_notes(user, request.args))


@bp.post("/notes")
@login_required
def create_note():
    user = current_user()
    note = note_service.create_note(user, request.get_json(silent=True))
    return jsonify({"note": note.serialize()}), 201


@bp.get("/notes/<int:note_id>")
@login_required
def get_note(note_id):
    user = current_user()
    return jsonify({"note": note_service.get_note(user, note_id)})


@bp.put("/notes/<int:note_id>")
@login_required
def update_note(note_id):
    user = current_user()
    note = note_service.update_note(user, note_id, request.get_json(silent=True))
    return jsonify({"note": note.serialize()})


@bp.delete("/notes/<int:note_id>")
@login_required
def delete_note(note_id):
    user = current_user()
    note_service.delete_note(user, note_id)
    return "", 204


@bp.patch("/notes/<int:note_id>/pin")
@login_required
def pin_note(note_id):
    user = current_user()
    payload = request.get_json(silent=True) or {}
    note = note_service.set_pinned(user, note_id, payload.get("isPinned"))
    return jsonify({"note": note.serialize()})


@bp.get("/dashboard")
@login_required
def dashboard():
    """Real statistics computed from the authenticated user's rows."""
    user = current_user()
    categories = category_service.list_categories(user)["categories"]
    return jsonify(note_service.dashboard(user, categories))
