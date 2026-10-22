"""Categories and tags service."""

from sqlalchemy import func, select

from app.errors import ApiError
from app.extensions import db
from app.models import Category, Note, Tag
from app.validation import require_json_object, validate_category_payload


def _owned_category(user, category_id):
    category = db.session.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise ApiError("Category not found.", 404)
    return category


def _name_conflicts(user):
    rows = db.session.execute(
        select(Category.name, Category.id).where(Category.user_id == user.id)
    ).all()
    return [(name, cid) for name, cid in rows]


def list_categories(user):
    """User's categories with real per-category note counts from the DB."""
    counts = dict(
        db.session.execute(
            select(Note.category_id, func.count(Note.id))
            .where(Note.user_id == user.id, Note.category_id.is_not(None))
            .group_by(Note.category_id)
        ).all()
    )
    uncategorized = (
        db.session.scalar(
            select(func.count(Note.id)).where(
                Note.user_id == user.id, Note.category_id.is_(None)
            )
        )
        or 0
    )

    categories = db.session.scalars(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.is_default.desc(), Category.name.asc())
    ).all()

    return {
        "categories": [
            category.serialize(note_count=counts.get(category.id, 0))
            for category in categories
        ],
        "uncategorizedCount": uncategorized,
    }


def create_category(user, payload):
    data = validate_category_payload(
        require_json_object(payload), existing_names=_name_conflicts(user)
    )
    category = Category(
        user_id=user.id,
        name=data.get("name"),
        description=data.get("description", ""),
        color=data.get("color", "default"),
        is_default=False,
    )
    db.session.add(category)
    try:
        db.session.flush()
    except Exception:
        db.session.rollback()
        raise ApiError("A category with this name already exists.", 409) from None
    db.session.commit()
    return category.serialize(note_count=0)


def update_category(user, category_id, payload):
    category = _owned_category(user, category_id)
    if category.is_default:
        raise ApiError("Default categories cannot be renamed.", 403)

    data = validate_category_payload(
        require_json_object(payload),
        existing_names=_name_conflicts(user),
        current_id=category.id,
        partial=True,
    )
    if "name" in data:
        category.name = data["name"]
    if "description" in data:
        category.description = data["description"]
    if "color" in data:
        category.color = data["color"]

    try:
        db.session.flush()
    except Exception:
        db.session.rollback()
        raise ApiError("A category with this name already exists.", 409) from None
    db.session.commit()
    return category.serialize(note_count=category.notes.count())


def delete_category(user, category_id):
    """
    Delete a custom category safely: its notes are detached (set to
    uncategorized), never deleted. Default categories are protected.
    """
    category = _owned_category(user, category_id)
    if category.is_default:
        raise ApiError("Default categories cannot be deleted.", 403)

    db.session.execute(
        Note.__table__.update()
        .where(Note.category_id == category.id, Note.user_id == user.id)
        .values(category_id=None)
    )
    db.session.delete(category)
    db.session.commit()
    return True


def list_tags(user):
    """The user's tag vocabulary with real usage counts."""
    from app.models import note_tags

    rows = db.session.execute(
        select(Tag.name, func.count(note_tags.c.note_id))
        .select_from(Tag)
        .join(note_tags, note_tags.c.tag_id == Tag.id)
        .where(Tag.user_id == user.id)
        .group_by(Tag.id, Tag.name)
        .order_by(Tag.name)
    ).all()
    return {
        "tags": [{"name": name, "noteCount": count} for name, count in rows],
    }
