"""
Class chat service (Part 2, Phases B–C): persistent messages, replies,
edit/delete policy, and secure attachments (images/documents/voice).

Rules enforced here:
  * Every call takes the AUTHENTICATED user and re-verifies class
    membership — sender identity never comes from the client payload.
  * Messages are plain text; serialization never marks content as HTML and
    the frontend renders it as text (React escapes by default).
  * Pagination is cursor-based (`before` / `after` message ids) so history
    never loads unbounded in one request.
  * Attachments are uploaded FIRST (pending, message_id NULL), then claimed
    by the message in the same transaction that persists the message — a
    message is never "sent" without its attachments committed, and unclaimed
    orphans are cleaned up opportunistically.
"""

from datetime import timedelta

from sqlalchemy import select

from app import file_validation, storage
from app.errors import ApiError
from app.extensions import db
from app.models import ChatAttachment, ChatMessage, utcnow
from app.services.class_service import require_membership
from app.validation import require_json_object

MESSAGE_MAX_CHARS = 4000
MESSAGE_PAGE_DEFAULT = 40
MESSAGE_PAGE_MAX = 100
ATTACHMENT_ORPHAN_TTL = 3600  # seconds before an unclaimed upload is purged

# Chat attachment rules by kind. Extensions reuse file_validation._ALLOWED
# (magic-byte checked); audio formats are added here because MediaRecorder
# output (webm/ogg/mp4) never appears in the Study Library allowlist.
_CHAT_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp"}
_CHAT_DOC_EXTS = {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md"}
_CHAT_AUDIO_EXTS = {"webm", "ogg", "oga", "mp4", "m4a", "mp3"}

_AUDIO_MAGIC = {
    # (extension -> list of (offset, magic bytes))
    "webm": ((0, b"\x1a\x45\xdf\xa3"),),          # EBML header (Matroska/WebM)
    "ogg": ((0, b"OggS"),),
    "oga": ((0, b"OggS"),),
    "mp4": ((4, b"ftyp"),),
    "m4a": ((4, b"ftyp"),),
    "mp3": ((0, b"ID3"), (0, b"\xff\xfb"), (0, b"\xff\xf3"), (0, b"\xff\xf2")),
}

_AUDIO_MIME = {
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "mp4": "audio/mp4",
    "m4a": "audio/mp4",
    "mp3": "audio/mpeg",
}


def _size_limit_bytes(kind: str, app_config=None) -> int:
    from flask import current_app

    config = app_config or current_app.config
    if kind == "image":
        mb = config.get("CHAT_MAX_IMAGE_MB", 10)
    elif kind == "audio":
        mb = config.get("CHAT_MAX_AUDIO_MB", 15)
    else:
        mb = config.get("CHAT_MAX_DOC_MB", 25)
    return int(mb) * 1024 * 1024


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def list_messages(user, class_id, args):
    """Cursor-paginated history: the newest page by default, or the page
    before/after a known message id. Returns {messages, hasMore}."""
    require_membership(user, class_id)

    def _int_arg(name, default=None):
        raw = args.get(name)
        if raw in (None, ""):
            return default
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise ApiError(f"Invalid {name} parameter.", 422) from None

    limit = min(_int_arg("limit", MESSAGE_PAGE_DEFAULT) or MESSAGE_PAGE_DEFAULT, MESSAGE_PAGE_MAX)
    before = _int_arg("before")
    after = _int_arg("after")

    query = select(ChatMessage).where(ChatMessage.class_id == class_id)
    if before is not None:
        query = query.where(ChatMessage.id < before).order_by(ChatMessage.id.desc()).limit(limit)
        rows = list(db.session.execute(query).scalars().all())
        rows.reverse()
        has_more = len(rows) == limit and rows[0].id > 1
    elif after is not None:
        query = query.where(ChatMessage.id > after).order_by(ChatMessage.id.asc()).limit(limit + 1)
        rows = list(db.session.execute(query).scalars().all())
        has_more = len(rows) > limit
        rows = rows[:limit]
    else:
        query = query.order_by(ChatMessage.id.desc()).limit(limit + 1)
        rows = list(db.session.execute(query).scalars().all())
        has_more = len(rows) > limit
        rows = rows[:limit]
        rows.reverse()

    return {
        "messages": [row.serialize(viewer_id=user.id) for row in rows],
        "hasMore": has_more,
    }


def _validate_content(raw_content) -> str:
    content = str(raw_content or "").strip()
    if len(content) > MESSAGE_MAX_CHARS:
        raise ApiError(
            f"Messages are limited to {MESSAGE_MAX_CHARS} characters.",
            422, details={"field": "content"},
        )
    return content


def _claim_attachments(user, class_id, attachment_ids) -> list[ChatAttachment]:
    """Validate that every id is a pending or own attachment of THIS class
    (never another class's file), and return the rows."""
    if attachment_ids in (None, []):
        return []
    if not isinstance(attachment_ids, list) or len(attachment_ids) > 10:
        raise ApiError("Too many attachments.", 422, details={"field": "attachmentIds"})
    rows = []
    for raw_id in attachment_ids:
        try:
            attachment_id = int(raw_id)
        except (TypeError, ValueError):
            raise ApiError("Invalid attachment id.", 422) from None
        row = db.session.get(ChatAttachment, attachment_id)
        if row is None or row.class_id != class_id or row.uploader_id != user.id:
            # 404: never reveal whether the id exists in another class.
            raise ApiError("Attachment not found.", 404)
        if row.message_id is not None:
            raise ApiError("That attachment was already sent.", 409)
        rows.append(row)
    return rows


def send_message(user, class_id, payload):
    """Persist a message with its attachments in one transaction. Sender is
    the authenticated user — full stop."""
    require_membership(user, class_id)
    payload = require_json_object(payload)

    content = _validate_content(payload.get("content"))
    attachments = _claim_attachments(user, class_id, payload.get("attachmentIds"))
    if not content and not attachments:
        raise ApiError("Write a message or attach a file.", 422, details={"field": "content"})

    reply_to = None
    reply_id = payload.get("replyToId")
    if reply_id not in (None, ""):
        try:
            reply_id = int(reply_id)
        except (TypeError, ValueError):
            raise ApiError("Invalid reply target.", 422) from None
        reply_to = db.session.get(ChatMessage, reply_id)
        # Cross-class replies are rejected: the reply must live here too.
        if reply_to is None or reply_to.class_id != class_id:
            raise ApiError("The message you are replying to was not found.", 404)

    _purge_stale_uploads(user, class_id)

    message = ChatMessage(
        class_id=class_id,
        sender_id=user.id,
        content=content,
        reply_to_id=reply_to.id if reply_to else None,
    )
    db.session.add(message)
    db.session.flush()
    for attachment in attachments:
        attachment.message_id = message.id
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return message.serialize(viewer_id=user.id)


def edit_message(user, message_id, payload):
    """Edit policy: a member may edit their OWN text only (not attachments,
    not another member's message — even the owner cannot rewrite someone
    else's words). Deleted messages are immutable tombstones."""
    payload = require_json_object(payload)
    message = db.session.get(ChatMessage, message_id)
    if message is None:
        raise ApiError("Message not found.", 404)
    require_membership(user, message.class_id)  # 404 if the class vanished
    if message.sender_id != user.id:
        raise ApiError("You can only edit your own messages.", 403)
    if message.is_deleted:
        raise ApiError("That message was deleted.", 409)

    content = _validate_content(payload.get("content"))
    if not content:
        raise ApiError("A message cannot be empty.", 422, details={"field": "content"})
    message.content = content
    message.edited_at = utcnow()
    db.session.commit()
    return message.serialize(viewer_id=user.id)


def delete_message(user, message_id, *, is_owner_admin=False):
    """Tombstone deletion: the row survives (so replies keep their anchor)
    but content and attachments are removed. Members delete their own
    messages; the class owner may also moderate (delete any message)."""
    message = db.session.get(ChatMessage, message_id)
    if message is None:
        raise ApiError("Message not found.", 404)
    membership = require_membership(user, message.class_id)
    if message.sender_id != user.id and membership.role != "owner":
        raise ApiError("You can only delete your own messages.", 403)
    if message.is_deleted:
        return {"deleted": True, "id": message.id}

    attachment_rows = list(message.attachments)
    message.is_deleted = True
    message.content = ""
    message.edited_at = None
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    # Remove bytes + rows outside the transaction (idempotent).
    for attachment in attachment_rows:
        storage.delete(attachment.stored_name)
    return {"deleted": True, "id": message.id}


# ---------------------------------------------------------------------------
# Attachments (images / documents / voice)
# ---------------------------------------------------------------------------

def _purge_stale_uploads(user, class_id, older_than=ATTACHMENT_ORPHAN_TTL):
    """Opportunistic cleanup of pending uploads whose message was never
    sent (browser crashed, user navigated away)."""
    cutoff = utcnow() - timedelta(seconds=older_than)
    stale = db.session.execute(
        select(ChatAttachment).where(
            ChatAttachment.class_id == class_id,
            ChatAttachment.uploader_id == user.id,
            ChatAttachment.message_id.is_(None),
            ChatAttachment.created_at < cutoff,
        )
    ).scalars().all()
    for row in stale:
        db.session.delete(row)
        storage.delete(row.stored_name)
    if stale:
        db.session.commit()


def save_attachment(user, class_id, file_storage, kind_hint=None):
    """
    Validate and store one chat upload (pending until sent).

    Kind is decided by the SERVER from the validated extension — the client
    may hint, but a .png can never be classified as audio. Content signatures
    (magic bytes) are verified; the browser-supplied MIME type is ignored.
    """
    require_membership(user, class_id)

    if file_storage is None or not getattr(file_storage, "filename", ""):
        raise ApiError("Choose a file to attach.", 422, details={"field": "file"})

    ext = file_validation.extension_of(file_storage.filename)
    if ext in _CHAT_IMAGE_EXTS:
        kind = "image"
    elif ext in _CHAT_DOC_EXTS:
        kind = "document"
    elif ext in _CHAT_AUDIO_EXTS:
        kind = "audio"
    else:
        allowed = ", ".join(sorted(_CHAT_IMAGE_EXTS | _CHAT_DOC_EXTS | _CHAT_AUDIO_EXTS))
        raise ApiError(
            f"Unsupported attachment type '.{ext}'. Allowed: {allowed}.",
            422, details={"field": "file"},
        )

    # Size cap enforced while streaming (never fully buffered).
    limit = _size_limit_bytes(kind)
    display_name = file_validation.sanitize_filename(file_storage.filename)
    stored_name = storage.new_stored_name(display_name)

    head = file_storage.stream.read(4096)
    if kind == "audio":
        checks = _AUDIO_MAGIC.get(ext, ())
        if checks:
            for offset, expected in checks:
                if head[offset:offset + len(expected)] != expected:
                    raise ApiError(
                        f"This recording does not look like a valid {label_audio(ext)} "
                        f"(content check failed for '.{ext}').",
                        422, details={"field": "file"},
                    )
        # Reject text/JSON masquerading as an audio file.
        if head[:15].lower().startswith((b"<html", b"<!doctype", b"{")):
            raise ApiError("That file is not a valid audio recording.", 422,
                           details={"field": "file"})
    else:
        file_validation.validate_extension(display_name)
        file_validation.validate_signature(ext, head)

    # Rewind so save_stream reads the full file (we consumed the head).
    file_storage.stream.seek(0)
    try:
        written = storage.save_stream(stored_name, file_storage.stream, max_bytes=limit)
    except storage.SizeLimitError as exc:
        raise ApiError(str(exc), 413, details={"field": "file"}) from exc
    if written == 0:
        storage.delete(stored_name)
        raise ApiError("The uploaded file is empty.", 422, details={"field": "file"})

    mime_type = _AUDIO_MIME.get(ext) if kind == "audio" else file_validation.mime_for(ext)
    attachment = ChatAttachment(
        class_id=class_id,
        uploader_id=user.id,
        original_name=display_name,
        stored_name=stored_name,
        mime_type=mime_type,
        size_bytes=written,
        kind=kind,
    )
    db.session.add(attachment)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        storage.delete(stored_name)
        raise
    return attachment.serialize()


def label_audio(ext: str) -> str:
    return {"webm": "WebM recording", "ogg": "OGG recording", "oga": "OGG recording",
            "mp4": "MP4 recording", "m4a": "M4A recording", "mp3": "MP3 recording"}.get(
        ext, "audio recording")


def get_attachment_payload(user, attachment_id, *, inline):
    """
    Authorization for attachment content: the viewer must be a member of
    the attachment's class AND the message must be sent (pending uploads are
    visible only to their uploader). Returns (path, display_name, mime).
    """
    attachment = db.session.get(ChatAttachment, attachment_id)
    if attachment is None:
        raise ApiError("Attachment not found.", 404)

    if attachment.message_id is None:
        if attachment.uploader_id != user.id:
            raise ApiError("Attachment not found.", 404)
    else:
        require_membership(user, attachment.class_id)  # 404 for non-members

    if attachment.kind == "document" and inline:
        raise ApiError("This file type cannot be previewed — download it instead.", 415)

    try:
        path = storage.file_path(attachment.stored_name)
        if not path.is_file():
            raise FileNotFoundError
    except FileNotFoundError as exc:
        raise ApiError("The stored copy of this attachment is missing.", 404) from exc
    return path, attachment.original_name, attachment.mime_type
