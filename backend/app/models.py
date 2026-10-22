"""
SQLAlchemy models: User, Category, Note, Tag and the note_tags association.

Conventions:
  * Timestamps are stored as naive UTC and serialized with a trailing "Z"
    so browsers parse them correctly.
  * Every user-owned row cascades from its owner; a deleted category
    detaches (never deletes) its notes at the service layer and via the
    database-level ON DELETE SET NULL rule.
  * Composite indexes cover the hot user-scoped lookups.
"""

from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db


def utcnow():
    """Naive UTC timestamp (UTC is stored explicitly, never local time)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(value):
    """Serialize a naive-UTC datetime as an ISO string ending in 'Z'."""
    if not value:
        return None
    return value.isoformat(timespec="seconds") + "Z"


# ---------------------------------------------------------------------------
# Association table
# ---------------------------------------------------------------------------

note_tags = db.Table(
    "note_tags",
    db.Column(
        "note_id",
        db.Integer,
        db.ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    ),
    db.Column(
        "tag_id",
        db.Integer,
        db.ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    ),
)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(32), nullable=False, default="member")
    # Bumped whenever every session must be invalidated (logout-all,
    # password change, account deletion). Stored in the session cookie, so
    # old cookies become invalid without keeping a token database.
    session_version = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    notes = db.relationship(
        "Note",
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    categories = db.relationship(
        "Category",
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    tags = db.relationship(
        "Tag",
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    @property
    def initials(self):
        parts = self.full_name.split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return self.full_name[:2].upper()

    def serialize(self):
        return {
            "id": self.id,
            "fullName": self.full_name,
            "email": self.email,
            "role": self.role,
            "createdAt": iso(self.created_at),
        }

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<User {self.email}>"


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

DEFAULT_CATEGORIES = (
    ("Work", "Meetings, tasks, and professional notes.", "work"),
    ("Study", "Course notes, revision, and research.", "study"),
    ("Personal", "Journaling, plans, and everyday life.", "personal"),
    ("Ideas", "Brainstorms, sparks, and inspiration.", "ideas"),
    ("Projects", "Roadmaps, specs, and build logs.", "projects"),
)

CATEGORY_COLORS = {"work", "study", "personal", "ideas", "projects", "default"}


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
        db.Index("ix_categories_user_name", "user_id", "name"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(40), nullable=False)
    description = db.Column(db.String(160), nullable=False, default="")
    color = db.Column(db.String(20), nullable=False, default="default")
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    owner = db.relationship("User", back_populates="categories")
    notes = db.relationship("Note", back_populates="category", lazy="dynamic")

    @classmethod
    def create_defaults_for(cls, user):
        """Seed the five default categories shown in the Part 1 UI.

        Uses the `owner` relationship (not user.id) so SQLAlchemy orders the
        inserts correctly even before the user row exists.
        """
        return [
            cls(
                owner=user,
                name=name,
                description=description,
                color=color,
                is_default=True,
            )
            for name, description, color in DEFAULT_CATEGORIES
        ]

    def serialize(self, note_count=None):
        payload = {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "color": self.color,
            "isDefault": bool(self.is_default),
            "createdAt": iso(self.created_at),
        }
        if note_count is not None:
            payload["noteCount"] = note_count
        return payload

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<Category {self.name} ({self.user_id})>"


# ---------------------------------------------------------------------------
# Tag
# ---------------------------------------------------------------------------

class Tag(db.Model):
    __tablename__ = "tags"
    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_tags_user_name"),
        db.Index("ix_tags_user_name", "user_id", "name"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(24), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    owner = db.relationship("User", back_populates="tags")

    def serialize(self):
        return {"id": self.id, "name": self.name}

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<Tag {self.name} ({self.user_id})>"


# ---------------------------------------------------------------------------
# Note
# ---------------------------------------------------------------------------

class Note(db.Model):
    __tablename__ = "notes"
    __table_args__ = (
        db.Index("ix_notes_user_updated", "user_id", "updated_at"),
        db.Index("ix_notes_user_created", "user_id", "created_at"),
        db.Index("ix_notes_user_pinned", "user_id", "is_pinned"),
        db.Index("ix_notes_user_category", "user_id", "category_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id = db.Column(
        db.Integer,
        db.ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(120), nullable=False)
    content = db.Column(db.Text, nullable=False, default="")
    is_pinned = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    owner = db.relationship("User", back_populates="notes")
    category = db.relationship("Category", back_populates="notes", lazy="joined")
    tags = db.relationship(
        "Tag",
        secondary=note_tags,
        backref=db.backref("notes", lazy="dynamic"),
        lazy="selectin",
        order_by="Tag.name",
    )

    def serialize(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "categoryId": self.category_id,
            "category": self.category.serialize() if self.category else None,
            "tags": [tag.name for tag in self.tags],
            "isPinned": bool(self.is_pinned),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<Note {self.id} {self.title!r}>"
