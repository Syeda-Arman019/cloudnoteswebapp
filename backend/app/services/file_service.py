"""
Files service: upload, browse/search/filter, download, preview, rename,
move, pin, Trash (soft delete + restore + purge), and multi-file ZIP.

Safety rules enforced here (routes stay thin):
  * Every query is scoped by user_id — a missing file and a foreign file
    both produce the same 404.
  * Uploads validate extension + content signature, stream to a private
    directory under a server-generated name, and keep the original name as
    metadata only.
  * Deleting a file moves it to the Trash (deleted_at); purge removes the
    stored bytes. Downloads of trashed files are refused until restored.
"""

import io
import zipfile

from flask import current_app
from sqlalchemy import func, select

from app import storage
from app.errors import ApiError
from app.extensions import db
from app.file_validation import (
    format_size,
    is_previewable,
    label_for,
    mime_for,
    sanitize_filename,
    validate_extension,
    validate_signature,
)
from app.models import Folder, StudyFile, utcnow
from app.validation import require_json_object

NOT_FOUND = "File not found."

# Head bytes inspected for content signatures.
_SIGNATURE_CHUNK = 4096

# Text preview cap: refuse to render huge text files in the browser.
MAX_TEXT_PREVIEW_BYTES = 1024 * 1024  # 1 MiB

# ZIP export bounds.
ZIP_MAX_FILES = 100
ZIP_MAX_TOTAL_BYTES = 200 * 1024 * 1024  # 200 MB

FILE_SORTS = {"newest", "oldest", "name", "size"}

SORT_COLUMNS = {
    "newest": (StudyFile.created_at.desc(), StudyFile.id.desc()),
    "oldest": (StudyFile.created_at.asc(), StudyFile.id.asc()),
    "name": (func.lower(StudyFile.original_name).asc(), StudyFile.id.asc()),
    "size": (StudyFile.size_bytes.desc(), StudyFile.id.desc()),
}


def _owned_file(user, file_id):
    file_row = db.session.get(StudyFile, file_id)
    if file_row is None or file_row.user_id != user.id:
        raise ApiError(NOT_FOUND, 404)
    return file_row


def _readable_file(user, file_id):
    """Owner OR current member of the class the file is shared with.

    Used by read paths only (view/download/preview); write paths keep
    `_owned_file`, so a class member can never rename, move or delete
    someone else's file. Membership is re-checked on EVERY request — not
    just when a link is first generated.
    """
    from app.services.class_service import user_can_access_file

    file_row = db.session.get(StudyFile, file_id)
    if file_row is None or not user_can_access_file(user, file_row):
        raise ApiError(NOT_FOUND, 404)
    return file_row


def _resolve_folder(user, folder_id):
    if folder_id in (None, ""):
        return None
    try:
        folder_id = int(folder_id)  # multipart form values arrive as strings
    except (TypeError, ValueError):
        raise ApiError("Choose a valid folder.", 422, details={"field": "folderId"}) from None
    folder = db.session.get(Folder, folder_id)
    if folder is None or folder.user_id != user.id:
        raise ApiError("Choose a valid folder.", 422, details={"field": "folderId"})
    return folder


def _touch_accessed(file_row):
    file_row.last_accessed_at = utcnow()
    db.session.commit()


def save_upload(user, upload, *, folder_id=None):
    """
    Validate and persist one uploaded file (werkzeug FileStorage).

    Returns the serialized StudyFile. Raises ApiError with a clear message
    for empty files, unsupported types, signature mismatches, and oversize
    files — the partial on-disk file is removed on every failure path.
    """
    if upload is None or not getattr(upload, "filename", ""):
        raise ApiError("Each upload must include a file.", 422, details={"field": "file"})

    original_name = sanitize_filename(upload.filename)
    ext = validate_extension(original_name)

    # Read the signature chunk first; the stream must be rewound for saving.
    head = upload.stream.read(_SIGNATURE_CHUNK)
    upload.stream.seek(0)
    validate_signature(ext, head)

    folder = _resolve_folder(user, folder_id)

    max_bytes = current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024

    stored_name = storage.new_stored_name(original_name)
    try:
        size = storage.save_stream(stored_name, upload.stream, max_bytes=max_bytes)
    except storage.SizeLimitError as exc:
        raise ApiError(
            f'"{original_name}" is too large. '
            f"Maximum file size is {format_size(max_bytes)}.",
            413, details={"field": "file"},
        ) from exc

    if size == 0:
        storage.delete(stored_name)
        raise ApiError(f'"{original_name}" is empty.', 422, details={"field": "file"})

    file_row = StudyFile(
        user_id=user.id,
        folder_id=folder.id if folder else None,
        original_name=original_name,
        stored_name=stored_name,
        extension=ext,
        mime_type=mime_for(ext),
        size_bytes=size,
        last_accessed_at=utcnow(),
    )
    db.session.add(file_row)
    try:
        db.session.commit()
    except Exception:
        storage.delete(stored_name)
        raise
    return file_row


def list_files(user, args):
    """Search/filter/sort/paginate the user's active (non-trashed) files."""
    query = select(StudyFile).where(
        StudyFile.user_id == user.id, StudyFile.deleted_at.is_(None)
    )

    search = str(args.get("q") or "").strip()
    if search:
        query = query.where(StudyFile.original_name.ilike(f"%{search}%"))

    folder = str(args.get("folder") or "").strip()
    if folder == "root":
        query = query.where(StudyFile.folder_id.is_(None))
    elif folder == "all":
        pass
    elif folder:
        try:
            query = query.where(StudyFile.folder_id == int(folder))
        except ValueError:
            raise ApiError("Invalid folder filter.", 400) from None

    file_type = str(args.get("type") or "").strip().lower().lstrip(".")
    if file_type:
        query = query.where(StudyFile.extension == file_type)

    pinned = str(args.get("pinned") or "").strip().lower()
    if pinned in {"true", "1", "pinned"}:
        query = query.where(StudyFile.is_pinned.is_(True))
    elif pinned not in {"", "all", "false", "0", "unpinned"}:
        raise ApiError("Invalid pinned filter.", 400)

    uploaded = str(args.get("uploaded") or "").strip().lower()
    if uploaded in {"today", "week", "month"}:
        from datetime import timedelta

        now = utcnow()
        cutoff = {
            "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
            "week": now - timedelta(days=7),
            "month": now - timedelta(days=30),
        }[uploaded]
        query = query.where(StudyFile.created_at >= cutoff)
    elif uploaded not in {"", "any", "all"}:
        raise ApiError("Invalid upload-date filter.", 400)

    sort = str(args.get("sort") or "newest").strip()
    if sort not in FILE_SORTS:
        raise ApiError("Invalid sort option.", 400)
    query = query.order_by(*SORT_COLUMNS[sort])

    page, per_page = _pagination(args)
    return _paginate(query, page, per_page)


def _pagination(args):
    try:
        page = max(int(args.get("page") or 1), 1)
    except (TypeError, ValueError):
        raise ApiError("Invalid page number.", 400) from None
    try:
        per_page = int(args.get("per_page") or current_app.config["NOTES_DEFAULT_PER_PAGE"])
    except (TypeError, ValueError):
        raise ApiError("Invalid per_page value.", 400) from None
    per_page = max(1, min(per_page, current_app.config["NOTES_MAX_PER_PAGE"]))
    return page, per_page


def _paginate(query, page, per_page):
    total = db.session.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.session.scalars(query.limit(per_page).offset((page - 1) * per_page)).all()
    return {
        "files": [row.serialize() for row in rows],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(-(-total // per_page), 1),
        },
    }


def list_trash(user, args):
    """The user's trashed files (newest trashed first)."""
    query = (
        select(StudyFile)
        .where(StudyFile.user_id == user.id, StudyFile.deleted_at.isnot(None))
        .order_by(StudyFile.deleted_at.desc(), StudyFile.id.desc())
    )
    search = str(args.get("q") or "").strip()
    if search:
        query = query.where(StudyFile.original_name.ilike(f"%{search}%"))
    page, per_page = _pagination(args)
    return _paginate(query, page, per_page)


def get_file(user, file_id):
    file_row = _readable_file(user, file_id)
    return file_row.serialize()


def update_file(user, file_id, payload):
    """Rename, move to another folder, and/or toggle pin."""
    payload = require_json_object(payload)
    file_row = _owned_file(user, file_id)
    changed = False

    if "name" in payload:
        name = sanitize_filename(payload.get("name"))
        # Renaming keeps the extension consistent with the stored bytes:
        # re-attach it when the user omits or mistypes it.
        if "." in name:
            ext = validate_extension(name)
            if ext != file_row.extension:
                raise ApiError(
                    f"The file type cannot be changed (keep the .{file_row.extension} extension).",
                    422, details={"field": "name"},
                )
        else:
            name = f"{name}.{file_row.extension}"
        file_row.original_name = name
        changed = True

    if "folderId" in payload:
        raw = payload.get("folderId")
        if raw in (None, ""):
            file_row.folder_id = None
        else:
            try:
                folder_id = int(raw)
            except (TypeError, ValueError):
                raise ApiError("Invalid folder.", 422, details={"field": "folderId"}) from None
            folder = _resolve_folder(user, folder_id)
            file_row.folder_id = folder.id
        changed = True

    if "isPinned" in payload:
        file_row.is_pinned = bool(payload.get("isPinned"))
        changed = True

    if not changed:
        raise ApiError("No valid fields to update.", 422)

    db.session.commit()
    return file_row.serialize()


def trash_file(user, file_id):
    """Soft-delete to the Trash (recoverable)."""
    file_row = _owned_file(user, file_id)
    if file_row.deleted_at is None:
        file_row.deleted_at = utcnow()
        db.session.commit()
    return True


def restore_file(user, file_id):
    """Restore from the Trash; if its folder is gone, it returns to the root."""
    file_row = _owned_file(user, file_id)
    if file_row.deleted_at is None:
        raise ApiError("That file is not in the trash.", 409)
    if file_row.folder_id is not None:
        folder = db.session.get(Folder, file_row.folder_id)
        if folder is None or folder.user_id != user.id:
            # Its folder is gone; the file returns to the library root.
            file_row.folder_id = None
    file_row.deleted_at = None
    db.session.commit()
    return file_row.serialize()


def purge_file(user, file_id):
    """Permanently delete: remove the stored bytes, then the row."""
    file_row = _owned_file(user, file_id)
    storage.delete(file_row.stored_name)
    db.session.delete(file_row)
    db.session.commit()
    return True


def empty_trash(user):
    """Permanently remove every trashed file for this user."""
    rows = db.session.scalars(
        select(StudyFile).where(
            StudyFile.user_id == user.id, StudyFile.deleted_at.isnot(None)
        )
    ).all()
    removed = 0
    for row in rows:
        storage.delete(row.stored_name)
        db.session.delete(row)
        removed += 1
    db.session.commit()
    return {"removed": removed}


def download_payload(user, file_id):
    """
    Prepare a download: (path, display_name, mime_type).

    Trashed files must be restored first; a stored file missing from disk is
    reported as a clean 404 rather than a server crash.
    """
    file_row = _readable_file(user, file_id)
    if file_row.deleted_at is not None:
        raise ApiError("Restore this file from the Trash before downloading it.", 409)
    try:
        path = storage.file_path(file_row.stored_name)
        if not path.is_file():
            raise FileNotFoundError
    except FileNotFoundError as exc:
        raise ApiError(
            "The stored copy of this file is missing. "
            "Upload it again or delete the entry.", 404
        ) from exc
    _touch_accessed(file_row)
    return path, file_row.original_name, file_row.mime_type


def preview_payload(user, file_id):
    """
    Prepare an inline preview: (path, mime_type) for supported formats only.

    Office formats (doc/docx/ppt/pptx/xls/xlsx) are deliberately NOT previewed
    — the UI offers a download instead. Never renders untrusted HTML.
    """
    file_row = _readable_file(user, file_id)
    if file_row.deleted_at is not None:
        raise ApiError("Restore this file from the Trash before previewing it.", 409)
    if not is_previewable(file_row.mime_type):
        raise ApiError(
            f"Preview is not available for {label_for(file_row.extension)} files — "
            "download it to view it.",
            415,
        )
    try:
        path = storage.file_path(file_row.stored_name)
        if not path.is_file():
            raise FileNotFoundError
    except FileNotFoundError as exc:
        raise ApiError("The stored copy of this file is missing.", 404) from exc
    _touch_accessed(file_row)
    return path, file_row.mime_type


def read_text_preview(user, file_id):
    """UTF-8 text content for .txt/.md previews, size-capped."""
    file_row = _readable_file(user, file_id)
    if file_row.mime_type not in {"text/plain", "text/markdown"}:
        raise ApiError("Text preview is only available for .txt and .md files.", 415)
    if file_row.size_bytes > MAX_TEXT_PREVIEW_BYTES:
        raise ApiError(
            "This text file is too large to preview — download it instead.", 413
        )
    path = storage.file_path(file_row.stored_name)
    if not path.is_file():
        raise ApiError("The stored copy of this file is missing.", 404)
    _touch_accessed(file_row)
    return path.read_text(encoding="utf-8", errors="replace")


def build_zip(user, file_ids):
    """
    Build a ZIP in memory containing the requested files, preserving their
    folder paths (relative to each other). Ownership is enforced per file;
    trashed and foreign files are refused with a clear 404/409.
    """
    if not isinstance(file_ids, (list, tuple)) or not file_ids:
        raise ApiError("Select at least one file to download.", 422)
    if len(file_ids) > ZIP_MAX_FILES:
        raise ApiError(
            f"You can download at most {ZIP_MAX_FILES} files at once.", 422
        )

    rows = []
    for file_id in file_ids:
        try:
            file_id = int(file_id)
        except (TypeError, ValueError):
            raise ApiError("Invalid file id.", 422) from None
        file_row = _owned_file(user, file_id)
        if file_row.deleted_at is not None:
            raise ApiError(
                f'"{file_row.original_name}" is in the trash — restore it first.', 409
            )
        rows.append(file_row)

    total = sum(row.size_bytes for row in rows)
    if total > ZIP_MAX_TOTAL_BYTES:
        raise ApiError(
            f"That selection is too large to ZIP "
            f"({format_size(total)}; limit {format_size(ZIP_MAX_TOTAL_BYTES)}).",
            413,
        )

    # Folder path per file (names only), built once.
    folder_paths = {}

    def folder_path(folder_id):
        if folder_id is None:
            return []
        if folder_id in folder_paths:
            return folder_paths[folder_id]
        folder = db.session.get(Folder, folder_id)
        parts = folder_path(folder.parent_id) + [folder.name] if folder else []
        folder_paths[folder_id] = parts
        return parts

    buffer = io.BytesIO()
    used_names = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for row in rows:
            parts = [sanitize_zip_part(p) for p in folder_path(row.folder_id)]
            base = sanitize_zip_part(row.original_name)
            candidate = "/".join(parts + [base]) if parts else base
            counter = 1
            while candidate in used_names:
                stem, dot, ext = base.rpartition(".")
                renamed = f"{stem} ({counter}){dot}{ext}" if dot else f"{base} ({counter})"
                candidate = "/".join(parts + [renamed]) if parts else renamed
                counter += 1
            used_names.add(candidate)
            with storage.open_for_read(row.stored_name) as source:
                archive.writestr(candidate, source.read())
    buffer.seek(0)
    return buffer


def sanitize_zip_part(name: str) -> str:
    """Keep ZIP entry path parts safe (no separators or traversal)."""
    cleaned = str(name).replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = cleaned.replace("..", "_").strip()
    return cleaned or "file"


def storage_usage(user):
    """Aggregate storage facts for the dashboard (real sums, never estimates)."""
    total_bytes, file_count = db.session.execute(
        select(func.coalesce(func.sum(StudyFile.size_bytes), 0), func.count(StudyFile.id)).where(
            StudyFile.user_id == user.id, StudyFile.deleted_at.is_(None)
        )
    ).one()
    trashed_count = db.session.scalar(
        select(func.count(StudyFile.id)).where(
            StudyFile.user_id == user.id, StudyFile.deleted_at.isnot(None)
        )
    ) or 0
    pinned = db.session.scalars(
        select(StudyFile)
        .where(
            StudyFile.user_id == user.id,
            StudyFile.is_pinned.is_(True),
            StudyFile.deleted_at.is_(None),
        )
        .order_by(StudyFile.created_at.desc())
        .limit(8)
    ).all()
    recent = db.session.scalars(
        select(StudyFile)
        .where(StudyFile.user_id == user.id, StudyFile.deleted_at.is_(None))
        .order_by(
            func.coalesce(StudyFile.last_accessed_at, StudyFile.created_at).desc()
        )
        .limit(8)
    ).all()
    return {
        "storage": {
            "usedBytes": int(total_bytes or 0),
            "fileCount": int(file_count or 0),
            "trashedCount": trashed_count,
            "usedLabel": format_size(int(total_bytes or 0)),
        },
        "pinnedFiles": [row.serialize() for row in pinned],
        "recentFiles": [row.serialize() for row in recent],
    }
