"""Files routes: uploads, browsing, download/preview, Trash, ZIP, stats."""

from flask import Blueprint, jsonify, request, send_file

from app.auth import current_user, login_required
from app.services import file_service

bp = Blueprint("files", __name__)


@bp.get("/files")
@login_required
def list_files():
    user = current_user()
    return jsonify(file_service.list_files(user, request.args))


@bp.post("/files")
@login_required
def upload_file():
    """
    Upload one file (multipart: `file`, optional `folderId`).

    The frontend sends one request per file so each file gets its own
    progress bar and its own success/failure message; multi-select and
    drag-and-drop simply fan out into several of these requests.
    """
    user = current_user()
    folder_id = request.form.get("folderId") or None
    file_row = file_service.save_upload(
        user, request.files.get("file"), folder_id=folder_id
    )
    return jsonify({"file": file_row.serialize()}), 201


@bp.get("/files/stats")
@login_required
def files_stats():
    """Dashboard data: storage usage, pinned files, recently accessed files."""
    user = current_user()
    return jsonify(file_service.storage_usage(user))


@bp.get("/files/trash")
@login_required
def list_trash():
    user = current_user()
    return jsonify(file_service.list_trash(user, request.args))


@bp.delete("/files/trash")
@login_required
def empty_trash():
    user = current_user()
    return jsonify(file_service.empty_trash(user))


@bp.post("/files/zip")
@login_required
def download_zip():
    """Download several files as a ZIP, preserving their folder structure."""
    user = current_user()
    payload = request.get_json(silent=True) or {}
    buffer = file_service.build_zip(user, payload.get("fileIds"))
    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="cloudnotes-files.zip",
        max_age=0,
    )


@bp.get("/files/<int:file_id>")
@login_required
def get_file(file_id):
    user = current_user()
    return jsonify({"file": file_service.get_file(user, file_id)})


@bp.put("/files/<int:file_id>")
@login_required
def update_file(file_id):
    user = current_user()
    file_row = file_service.update_file(user, file_id, request.get_json(silent=True))
    return jsonify({"file": file_row})


@bp.delete("/files/<int:file_id>")
@login_required
def trash_file(file_id):
    """Soft-delete to the Trash (recoverable)."""
    user = current_user()
    file_service.trash_file(user, file_id)
    return "", 204


@bp.patch("/files/<int:file_id>/restore")
@login_required
def restore_file(file_id):
    user = current_user()
    return jsonify({"file": file_service.restore_file(user, file_id)})


@bp.delete("/files/<int:file_id>/purge")
@login_required
def purge_file(file_id):
    """Permanently delete one trashed file and its stored bytes."""
    user = current_user()
    file_service.purge_file(user, file_id)
    return "", 204


@bp.get("/files/<int:file_id>/download")
@login_required
def download_file(file_id):
    """Stream the original bytes as an attachment (ownership-checked)."""
    user = current_user()
    path, name, mime = file_service.download_payload(user, file_id)
    return send_file(
        path, mimetype=mime, as_attachment=True, download_name=name, max_age=0
    )


@bp.get("/files/<int:file_id>/preview")
@login_required
def preview_file(file_id):
    """Inline preview for PDF/images only; other types get a clear 415."""
    user = current_user()
    path, mime = file_service.preview_payload(user, file_id)
    return send_file(path, mimetype=mime, as_attachment=False, max_age=0)


@bp.get("/files/<int:file_id>/preview/text")
@login_required
def preview_text(file_id):
    """UTF-8 text content for .txt/.md previews (size-capped)."""
    user = current_user()
    return jsonify({"content": file_service.read_text_preview(user, file_id)})
