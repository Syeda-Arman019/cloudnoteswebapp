"""Folders routes: the Study Library hierarchy (tree, CRUD, safe deletion)."""

from flask import Blueprint, jsonify, request

from app.auth import current_user, login_required
from app.services import file_service, folder_service

bp = Blueprint("folders", __name__)


@bp.get("/folders")
@login_required
def list_folders():
    """Flat folder list with counts; the frontend assembles the tree."""
    user = current_user()
    return jsonify(folder_service.list_folders(user))


@bp.post("/folders")
@login_required
def create_folder():
    user = current_user()
    folder = folder_service.create_folder(user, request.get_json(silent=True))
    return jsonify({"folder": folder}), 201


@bp.get("/folders/<int:folder_id>")
@login_required
def get_folder(folder_id):
    user = current_user()
    return jsonify({"folder": folder_service.get_folder(user, folder_id)})


@bp.put("/folders/<int:folder_id>")
@login_required
def update_folder(folder_id):
    user = current_user()
    folder = folder_service.update_folder(user, folder_id, request.get_json(silent=True))
    return jsonify({"folder": folder})


@bp.delete("/folders/<int:folder_id>")
@login_required
def delete_folder(folder_id):
    """
    Safe deletion: the first call (no confirmation) rejects a non-empty
    folder with 409 + counts; the UI then asks the user to confirm and
    retries with `recursive=true`, which trashes (never destroys) files.
    """
    user = current_user()
    recursive = str(request.args.get("recursive", "")).lower() in {"1", "true", "yes"}
    if not recursive:
        payload = request.get_json(silent=True) or {}
        recursive = bool(payload.get("recursive"))
    result = folder_service.delete_folder(user, folder_id, recursive=recursive)
    return jsonify(result)


@bp.get("/folders/<int:folder_id>/contents")
@login_required
def folder_contents(folder_id):
    """Files (paginated, filterable) + breadcrumbs in one round trip."""
    user = current_user()
    payload = folder_service.breadcrumbs(user, folder_id)
    payload.update(file_service.list_files(user, request.args))
    payload["folder"] = folder_service.get_folder(user, folder_id)
    return jsonify(payload)
