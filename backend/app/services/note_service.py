"""
Notes service: ownership-scoped CRUD, search, filtering, sorting, pagination.

Every query is filtered by `user_id`, so one user can never read or modify
another user's notes — a missing note and a foreign note both produce the
same 404, which avoids leaking the existence of other people's data.
"""

from sqlalchemy import func, or_, select

from app.errors import ApiError
from app.extensions import db
from app.models import Category, Note, Tag, note_tags
from app.validation import VALID_SORTS, require_json_object, validate_note_payload

SORT_COLUMNS = {
    "newest": (Note.created_at.desc(), Note.id.desc()),
    "oldest": (Note.created_at.asc(), Note.id.asc()),
    "updated": (Note.updated_at.desc(), Note.id.desc()),
}

NOT_FOUND = "Note not found."


def _owned_note(user, note_id):
    note = db.session.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise ApiError(NOT_FOUND, 404)
    return note


def _resolve_category(user, category_id):
    if category_id is None:
        return None
    category = db.session.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise ApiError("Choose a valid category.", 422, details={"field": "categoryId"})
    return category


def _sync_tags(user, note, tag_names):
    """Replace the note's tags with `tag_names`, reusing the user's tags."""
    wanted = {name.lower(): name for name in tag_names}
    existing_by_lower = {tag.name.lower(): tag for tag in user.tags}

    resolved = []
    for lower, original in wanted.items():
        tag = existing_by_lower.get(lower)
        if tag is None:
            tag = Tag(user_id=user.id, name=original)
            db.session.add(tag)
            existing_by_lower[lower] = tag
        resolved.append(tag)

    # Assigning the full collection lets SQLAlchemy manage note_tags rows.
    note.tags = resolved


def list_notes(user, args):
    """Search/filter/sort/paginate the current user's notes."""
    query = select(Note).where(Note.user_id == user.id)

    search = str(args.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Note.title.ilike(pattern), Note.content.ilike(pattern)))

    category = str(args.get("category") or "").strip()
    if category == "uncategorized":
        query = query.where(Note.category_id.is_(None))
    elif category:
        try:
            query = query.where(Note.category_id == int(category))
        except ValueError:
            raise ApiError("Invalid category filter.", 400) from None

    pinned = str(args.get("pinned") or "").strip().lower()
    if pinned in {"true", "pinned", "1"}:
        query = query.where(Note.is_pinned.is_(True))
    elif pinned in {"false", "unpinned", "0"}:
        query = query.where(Note.is_pinned.is_(False))
    elif pinned not in {"", "all"}:
        raise ApiError("Invalid pinned filter.", 400)

    tag = str(args.get("tag") or "").strip().lstrip("#")
    if tag:
        query = (
            query.join(note_tags, note_tags.c.note_id == Note.id)
            .join(Tag, Tag.id == note_tags.c.tag_id)
            .where(Tag.user_id == user.id, func.lower(Tag.name) == tag.lower())
        )

    sort = str(args.get("sort") or "newest").strip()
    if sort not in VALID_SORTS:
        raise ApiError("Invalid sort option.", 400)
    query = query.order_by(*SORT_COLUMNS[sort])

    try:
        page = max(int(args.get("page") or 1), 1)
    except (TypeError, ValueError):
        raise ApiError("Invalid page number.", 400) from None

    from flask import current_app

    default_per_page = current_app.config["NOTES_DEFAULT_PER_PAGE"]
    max_per_page = current_app.config["NOTES_MAX_PER_PAGE"]
    try:
        per_page = int(args.get("per_page") or default_per_page)
    except (TypeError, ValueError):
        raise ApiError("Invalid per_page value.", 400) from None
    per_page = max(1, min(per_page, max_per_page))

    total = db.session.scalar(
        select(func.count()).select_from(query.subquery())
    ) or 0
    rows = db.session.scalars(query.limit(per_page).offset((page - 1) * per_page)).all()

    return {
        "notes": [note.serialize() for note in rows],
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(-(-total // per_page), 1),
        },
    }


def get_owned_note(user, note_id):
    """Return the ORM note if it exists AND belongs to the user, else 404."""
    return _owned_note(user, note_id)


def get_note(user, note_id):
    return _owned_note(user, note_id).serialize()


def create_note(user, payload):
    data = validate_note_payload(require_json_object(payload))
    note = Note(
        user_id=user.id,
        title=data["title"],
        content=data.get("content", ""),
        category_id=data.get("category_id"),
        is_pinned=data.get("is_pinned", False),
    )
    _resolve_category(user, data.get("category_id"))
    _sync_tags(user, note, data.get("tags", []))
    db.session.add(note)
    db.session.commit()
    return note


def update_note(user, note_id, payload):
    note = _owned_note(user, note_id)
    data = validate_note_payload(require_json_object(payload), partial=True)
    if not data:
        raise ApiError("No valid fields to update.", 422)

    if "category_id" in data:
        _resolve_category(user, data["category_id"])
        note.category_id = data["category_id"]
    if "title" in data:
        note.title = data["title"]
    if "content" in data:
        note.content = data["content"]
    if "is_pinned" in data:
        note.is_pinned = data["is_pinned"]
    if "tags" in data:
        _sync_tags(user, note, data["tags"])

    db.session.commit()
    return note


def delete_note(user, note_id):
    note = _owned_note(user, note_id)
    db.session.delete(note)
    db.session.commit()
    return True


def set_pinned(user, note_id, is_pinned):
    note = _owned_note(user, note_id)
    note.is_pinned = bool(is_pinned)
    db.session.commit()
    return note


def dashboard(user, categories):
    """
    Real dashboard statistics computed from the user's database rows:
    totals, pinned count, category count, notes updated this week, and the
    five most recently updated notes.
    """
    from datetime import datetime, timedelta

    total = db.session.scalar(
        select(func.count(Note.id)).where(Note.user_id == user.id)
    ) or 0
    pinned = db.session.scalar(
        select(func.count(Note.id)).where(
            Note.user_id == user.id, Note.is_pinned.is_(True)
        )
    ) or 0
    week_ago = datetime.utcnow() - timedelta(days=7)
    updated_this_week = db.session.scalar(
        select(func.count(Note.id)).where(
            Note.user_id == user.id, Note.updated_at >= week_ago
        )
    ) or 0
    uncategorized = db.session.scalar(
        select(func.count(Note.id)).where(
            Note.user_id == user.id, Note.category_id.is_(None)
        )
    ) or 0

    recent = db.session.scalars(
        select(Note)
        .where(Note.user_id == user.id)
        .order_by(Note.updated_at.desc(), Note.id.desc())
        .limit(5)
    ).all()

    return {
        "stats": {
            "total": total,
            "pinned": pinned,
            "categories": len(categories),
            "uncategorized": uncategorized,
            "updatedThisWeek": updated_this_week,
        },
        "recentNotes": [note.serialize() for note in recent],
    }
