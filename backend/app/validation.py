"""
Server-side validation.

Every function either raises ApiError(422/400) with a human-readable message
or returns the cleaned value. The frontend repeats these rules for instant
feedback — the server never trusts them.
"""

import re

from app.errors import ApiError

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")

PASSWORD_MIN = 8
TITLE_MAX = 120
CONTENT_MAX = 40000
NAME_MIN, NAME_MAX = 2, 80
CATEGORY_NAME_MAX = 40
CATEGORY_DESC_MAX = 160
TAG_MAX_LEN = 24
TAG_MAX_COUNT = 8
VALID_SORTS = {"newest", "oldest", "updated"}


def require_json_object(payload):
    if not isinstance(payload, dict):
        raise ApiError("Request body must be a JSON object.", 400)
    return payload


def validate_email(value):
    email = str(value or "").strip().lower()
    if not email:
        raise ApiError("Email is required.", 422, details={"field": "email"})
    if len(email) > 255 or not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.", 422, details={"field": "email"})
    return email


def validate_full_name(value):
    name = " ".join(str(value or "").split())
    if not name:
        raise ApiError("Full name is required.", 422, details={"field": "fullName"})
    if len(name) < NAME_MIN:
        raise ApiError(
            "Full name must be at least 2 characters.", 422, details={"field": "fullName"}
        )
    if len(name) > NAME_MAX:
        raise ApiError(
            f"Full name must be {NAME_MAX} characters or fewer.",
            422,
            details={"field": "fullName"},
        )
    return name


def validate_password(value, field="password"):
    password = str(value or "")
    if not password:
        raise ApiError("Password is required.", 422, details={"field": field})
    if len(password) < PASSWORD_MIN:
        raise ApiError(
            f"Password must be at least {PASSWORD_MIN} characters.",
            422,
            details={"field": field},
        )
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        raise ApiError(
            "Include at least one letter and one number.",
            422,
            details={"field": field},
        )
    if len(password) > 128:
        raise ApiError("Password must be 128 characters or fewer.", 422, details={"field": field})
    return password


def validate_note_payload(payload, *, partial=False):
    """Validate create (full) or update (partial) note data."""
    data = {}
    if not partial or "title" in payload:
        title = str(payload.get("title") or "").strip()
        if not title:
            raise ApiError("A note title is required.", 422, details={"field": "title"})
        if len(title) > TITLE_MAX:
            raise ApiError(
                f"Title must be {TITLE_MAX} characters or fewer.",
                422,
                details={"field": "title"},
            )
        data["title"] = title

    if not partial or "content" in payload:
        content = str(payload.get("content") or "")
        if not content.strip():
            raise ApiError("Note content is required.", 422, details={"field": "content"})
        if len(content) > CONTENT_MAX:
            raise ApiError(
                f"Content must be {CONTENT_MAX} characters or fewer.",
                422,
                details={"field": "content"},
            )
        data["content"] = content

    if "categoryId" in payload:
        raw = payload.get("categoryId")
        if raw in (None, ""):
            data["category_id"] = None
        elif isinstance(raw, bool) or not isinstance(raw, (int, str, float)):
            raise ApiError("Invalid category.", 422, details={"field": "categoryId"})
        else:
            try:
                data["category_id"] = int(raw)
            except (TypeError, ValueError):
                raise ApiError(
                    "Invalid category.", 422, details={"field": "categoryId"}
                ) from None

    if "isPinned" in payload:
        data["is_pinned"] = bool(payload.get("isPinned"))

    if "tags" in payload:
        data["tags"] = validate_tags(payload.get("tags"))

    return data


def validate_tags(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ApiError("Tags must be a list of strings.", 422, details={"field": "tags"})

    seen, cleaned = set(), []
    for raw in value:
        if not isinstance(raw, str):
            raise ApiError(
                "Tags must be strings.", 422, details={"field": "tags"}
            )
        tag = raw.strip().lstrip("#")
        if not tag:
            continue
        if len(tag) > TAG_MAX_LEN:
            raise ApiError(
                f"Each tag must be {TAG_MAX_LEN} characters or fewer.",
                422,
                details={"field": "tags"},
            )
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(tag)
        if len(cleaned) > TAG_MAX_COUNT:
            raise ApiError(
                f"Use at most {TAG_MAX_COUNT} tags.", 422, details={"field": "tags"}
            )
    return cleaned


def validate_category_payload(payload, *, existing_names=(), current_id=None, partial=False):
    data = {}
    if not partial or "name" in payload:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ApiError("Category name is required.", 422, details={"field": "name"})
        if len(name) < 2:
            raise ApiError(
                "Category name must be at least 2 characters.",
                422,
                details={"field": "name"},
            )
        if len(name) > CATEGORY_NAME_MAX:
            raise ApiError(
                f"Category name must be {CATEGORY_NAME_MAX} characters or fewer.",
                422,
                details={"field": "name"},
            )
        for existing in existing_names:
            other_name, other_id = existing
            if other_id != current_id and other_name.lower() == name.lower():
                raise ApiError(
                    "A category with this name already exists.", 409, details={"field": "name"}
                )
        data["name"] = name

    if "description" in payload:
        description = str(payload.get("description") or "").strip()
        if len(description) > CATEGORY_DESC_MAX:
            raise ApiError(
                f"Description must be {CATEGORY_DESC_MAX} characters or fewer.",
                422,
                details={"field": "description"},
            )
        data["description"] = description

    if "color" in payload:
        from app.models import CATEGORY_COLORS

        color = str(payload.get("color") or "default")
        if color not in CATEGORY_COLORS:
            raise ApiError(
                "Choose a valid category colour.", 422, details={"field": "color"}
            )
        data["color"] = color

    return data
