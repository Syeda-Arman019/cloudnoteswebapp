"""Export routes: download a single note in the requested format."""

from io import BytesIO

from flask import Blueprint, send_file

from app.auth import current_user, login_required
from app.services import export_service, note_service

bp = Blueprint("exports", __name__)


@bp.get("/notes/<int:note_id>/export/<string:format_id>")
@login_required
def export_note(note_id, format_id):
    """
    Generate and stream a fresh export of the user's own note.

    Ownership is checked first (foreign/missing notes share one 404), then
    the file is built in memory from the latest database content — nothing
    is stored on the server.
    """
    user = current_user()
    note = note_service.get_owned_note(user, note_id)

    data, content_type, filename = export_service.build_export(note, format_id)

    # `filename` is an ASCII-safe slug produced by slugify_filename, so
    # Werkzeug's generated Content-Disposition header is always valid —
    # even for Unicode or punctuation-heavy note titles.
    return send_file(
        BytesIO(data),
        mimetype=content_type,
        as_attachment=True,
        download_name=filename,
        max_age=0,
    )
