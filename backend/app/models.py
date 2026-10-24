"""
SQLAlchemy models: User, Category, Note, Tag, note_tags, Folder, StudyFile,
StudyClass, ClassMembership, ClassInvitation, ChatMessage, ChatAttachment.

Conventions:
  * Timestamps are stored as naive UTC and serialized with a trailing "Z"
    so browsers parse them correctly.
  * Every user-owned row cascades from its owner; a deleted category
    detaches (never deletes) its notes at the service layer and via the
    database-level ON DELETE SET NULL rule.
  * Composite indexes cover the hot user-scoped lookups.
  * Uploaded files keep metadata here; the bytes live on disk under a
    private uploads directory (see app/storage.py). Deleting a folder never
    destroys files silently — they move to the Trash (deleted_at) first.
"""

from datetime import datetime, timezone

from sqlalchemy import Index, UniqueConstraint
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
        db.Index("ix_notes_user_folder", "user_id", "folder_id"),
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
    # Optional link into the Study Library hierarchy (semester/subject/
    # topic folder). Notes stay fully usable without one.
    folder_id = db.Column(
        db.Integer,
        db.ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(120), nullable=False)
    content = db.Column(db.Text, nullable=False, default="")
    is_pinned = db.Column(db.Boolean, nullable=False, default=False)
    # SET NULL on class deletion: shared resources revert to private, never
    # public. NULL = private to the owner (the default for every note).
    shared_class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    owner = db.relationship("User", back_populates="notes")
    shared_class = db.relationship("StudyClass", lazy="joined")
    category = db.relationship("Category", back_populates="notes", lazy="joined")
    folder = db.relationship("Folder", lazy="joined")
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
            "folderId": self.folder_id,
            "folder": self.folder.serialize() if self.folder else None,
            "sharedClassId": self.shared_class_id,
            "sharedClassName": self.shared_class.name if self.shared_class else None,
            "tags": [tag.name for tag in self.tags],
            "isPinned": bool(self.is_pinned),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<Note {self.id} {self.title!r}>"


# ---------------------------------------------------------------------------
# Folder (Study Library hierarchy)
# ---------------------------------------------------------------------------

FOLDER_NAME_MAX = 80
FOLDER_MAX_DEPTH = 6  # e.g. Year → Semester → Subject → Topic → Unit → Week


class Folder(db.Model):
    """A user-owned folder. `parent_id=None` means the library root.

    The hierarchy is intentionally generic (name + parent) so students can
    model Academic Year → Semester → Subject → Topic, or any custom layout.
    Deleting a folder is handled in the service layer: contents are moved to
    the Trash (recoverable), never silently destroyed.
    """

    __tablename__ = "folders"
    __table_args__ = (
        UniqueConstraint("user_id", "parent_id", "name", name="uq_folders_user_parent_name"),
        Index("ix_folders_user_parent", "user_id", "parent_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # SET NULL: re-parenting children to the library root on deletion; the
    # service layer moves their files to the Trash in the same transaction.
    parent_id = db.Column(
        db.Integer,
        db.ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = db.Column(db.String(FOLDER_NAME_MAX), nullable=False)
    # Sharing to a class exposes this folder AND its descendant files/folders
    # to that class (inheritance is the documented, enforced rule). Unsharing
    # or leaving the class revokes everything under it.
    shared_class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    owner = db.relationship("User", backref="folders")
    shared_class = db.relationship("StudyClass", lazy="joined")

    def effective_class_id(self):
        """Nearest shared_class_id on the ancestor chain (self, then parents).

        Sharing a folder shares its subtree; the check walks up so a file in
        an unflagged subfolder is still authorized through its grandparent.
        """
        node = self
        visited = 0
        while node is not None and visited < FOLDER_MAX_DEPTH + 1:
            if node.shared_class_id is not None:
                return node.shared_class_id
            node = node.parent
            visited += 1
        return None
    parent = db.relationship(
        "Folder", remote_side=[id], backref=db.backref("children", lazy="dynamic")
    )

    def serialize(self, file_count=None, folder_count=None):
        payload = {
            "id": self.id,
            "name": self.name,
            "parentId": self.parent_id,
            "sharedClassId": self.shared_class_id,
            "sharedClassName": self.shared_class.name if self.shared_class else None,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }
        if file_count is not None:
            payload["fileCount"] = file_count
        if folder_count is not None:
            payload["folderCount"] = folder_count
        return payload

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<Folder {self.name!r} ({self.user_id})>"


# ---------------------------------------------------------------------------
# StudyFile (uploaded study materials)
# ---------------------------------------------------------------------------

FILE_NAME_MAX = 255


class StudyFile(db.Model):
    """Metadata for one uploaded file. Bytes live in app/storage.py's store.

    `deleted_at` implements the Trash: soft-deleted rows stay recoverable
    until the user purges them, which also removes the stored bytes.
    """

    __tablename__ = "study_files"
    __table_args__ = (
        Index("ix_study_files_user_deleted", "user_id", "deleted_at"),
        Index("ix_study_files_user_folder", "user_id", "folder_id"),
        Index("ix_study_files_user_pinned", "user_id", "is_pinned"),
        Index("ix_study_files_user_accessed", "user_id", "last_accessed_at"),
        Index("ix_study_files_shared_class", "shared_class_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    folder_id = db.Column(
        db.Integer,
        db.ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Explicit class sharing (file-level share). A file may be shared either
    # directly or via an ancestor folder; access is granted if either source
    # resolves to a class the requester is a member of. NULL = private.
    shared_class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="SET NULL"),
        nullable=True,
    )
    # The user-visible original filename (sanitized, never used on disk).
    original_name = db.Column(db.String(FILE_NAME_MAX), nullable=False)
    # Server-generated unique on-disk name (uuid4 + extension) — no path
    # components ever come from the client, so traversal is impossible.
    stored_name = db.Column(db.String(64), nullable=False, unique=True)
    extension = db.Column(db.String(16), nullable=False, default="")
    mime_type = db.Column(db.String(120), nullable=False, default="application/octet-stream")
    size_bytes = db.Column(db.BigInteger, nullable=False, default=0)
    is_pinned = db.Column(db.Boolean, nullable=False, default=False)
    # Trash marker: NULL = active, timestamp = soft-deleted (recoverable).
    deleted_at = db.Column(db.DateTime, nullable=True)
    last_accessed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    owner = db.relationship("User", backref="study_files")
    folder = db.relationship("Folder", backref="files", lazy="joined")
    shared_class = db.relationship("StudyClass", lazy="joined")

    def effective_class_id(self):
        """Class this file is shared with: its own flag, else the nearest
        ancestor folder's flag. Returns None when fully private."""
        if self.shared_class_id is not None:
            return self.shared_class_id
        if self.folder is not None:
            return self.folder.effective_class_id()
        return None

    def serialize(self, folder_name=None):
        payload = {
            "id": self.id,
            "name": self.original_name,
            "folderId": self.folder_id,
            "folderName": folder_name
            if folder_name is not None
            else (self.folder.name if self.folder else None),
            "extension": self.extension,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "isPinned": bool(self.is_pinned),
            "sharedClassId": self.shared_class_id,
            "sharedClassName": self.shared_class.name if self.shared_class else None,
            "isTrashed": self.deleted_at is not None,
            "deletedAt": iso(self.deleted_at),
            "lastAccessedAt": iso(self.last_accessed_at),
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        }
        return payload

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<StudyFile {self.original_name!r} ({self.user_id})>"


# ---------------------------------------------------------------------------
# Part 2 — Classes, membership, invitations, sharing, chat
# ---------------------------------------------------------------------------

class StudyClass(db.Model):
    """A class/group (e.g. "23 Batch"). Owned by one user; many may exist
    per user. Sharing flags on resources point here with ON DELETE SET NULL
    so deleting a class reverts shared resources to private, never public.
    """

    __tablename__ = "study_classes"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(400), nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    owner = db.relationship("User", backref=db.backref("owned_classes", lazy="dynamic"))
    memberships = db.relationship(
        "ClassMembership", back_populates="study_class",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    def serialize(self, member_count=None, unread=None, my_role=None, joined_at=None):
        payload = {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "ownerId": self.owner_id,
            "createdAt": iso(self.created_at),
        }
        if member_count is not None:
            payload["memberCount"] = member_count
        if unread is not None:
            payload["unreadCount"] = unread
        if my_role is not None:
            payload["myRole"] = my_role
        if joined_at is not None:
            payload["joinedAt"] = iso(joined_at)
        return payload

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<StudyClass {self.name!r} ({self.id})>"


class ClassMembership(db.Model):
    """One row per (class, user) — the unique constraint makes duplicate
    active memberships impossible even under concurrent joins.
    `role` is 'owner' or 'member'; authorization lives in class_service.
    `last_read_at` drives unread counts.
    """

    __tablename__ = "class_memberships"
    __table_args__ = (
        UniqueConstraint("class_id", "user_id", name="uq_class_members_class_user"),
        Index("ix_class_members_user", "user_id"),
        Index("ix_class_members_class_role", "class_id", "role"),
    )

    id = db.Column(db.Integer, primary_key=True)
    class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = db.Column(db.String(16), nullable=False, default="member")
    last_read_at = db.Column(db.DateTime, nullable=True)
    joined_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    study_class = db.relationship("StudyClass", back_populates="memberships")
    user = db.relationship("User", backref=db.backref("class_memberships", lazy="dynamic"))

    def serialize(self, include_user=True):
        payload = {
            "classId": self.class_id,
            "role": self.role,
            "joinedAt": iso(self.joined_at),
            "lastReadAt": iso(self.last_read_at),
        }
        if include_user and self.user:
            payload["user"] = {
                "id": self.user.id,
                "fullName": self.user.full_name,
                "initials": self.user.initials,
            }
        return payload

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<ClassMembership c{self.class_id} u{self.user_id} {self.role}>"


class ClassInvitation(db.Model):
    """Invitation to a class. Only the SHA-256 hash of the token is stored —
    the raw token appears exactly once, in the creation response. Supports
    expiry, optional use limits, and revocation.
    """

    __tablename__ = "class_invitations"
    __table_args__ = (
        Index("ix_class_invitations_token_hash", "token_hash"),
        Index("ix_class_invitations_class", "class_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash = db.Column(db.String(64), nullable=False)
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at = db.Column(db.DateTime, nullable=True)
    max_uses = db.Column(db.Integer, nullable=True)  # None = unlimited
    use_count = db.Column(db.Integer, nullable=False, default=0)
    revoked_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    study_class = db.relationship("StudyClass", backref=db.backref("invitations", lazy="dynamic"))

    @property
    def status(self):
        if self.revoked_at is not None:
            return "revoked"
        if self.expires_at is not None and self.expires_at <= utcnow():
            return "expired"
        if self.max_uses is not None and self.use_count >= self.max_uses:
            return "exhausted"
        return "active"

    def serialize(self):
        """Never includes the raw token or its hash."""
        return {
            "id": self.id,
            "classId": self.class_id,
            "status": self.status,
            "expiresAt": iso(self.expires_at),
            "maxUses": self.max_uses,
            "useCount": self.use_count,
            "createdAt": iso(self.created_at),
        }

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<ClassInvitation {self.id} class={self.class_id} {self.status}>"


class ChatMessage(db.Model):
    """Persistent class chat message. Sender identity comes from the session
    (set by the route), never from the client. `is_deleted` is a tombstone:
    content is cleared but the row survives so replies stay valid.
    """

    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_class_created", "class_id", "created_at"),
        Index("ix_chat_messages_sender", "sender_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    reply_to_id = db.Column(
        db.Integer,
        db.ForeignKey("chat_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    content = db.Column(db.Text, nullable=False, default="")
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)
    edited_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    sender = db.relationship("User", foreign_keys=[sender_id])
    reply_to = db.relationship("ChatMessage", remote_side=[id], foreign_keys=[reply_to_id])
    attachments = db.relationship(
        "ChatAttachment", back_populates="message",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    def serialize(self, viewer_id=None):
        payload = {
            "id": self.id,
            "classId": self.class_id,
            "senderId": self.sender_id,
            "senderName": self.sender.full_name if self.sender else "Unknown user",
            "senderInitials": self.sender.initials if self.sender else "?",
            "replyTo": None,
            "content": "" if self.is_deleted else (self.content or ""),
            "isDeleted": bool(self.is_deleted),
            "isOwn": viewer_id is not None and self.sender_id == viewer_id,
            "editedAt": iso(self.edited_at),
            "createdAt": iso(self.created_at),
            "attachments": [a.serialize() for a in self.attachments],
        }
        if self.reply_to is not None and not self.reply_to.is_deleted:
            payload["replyTo"] = {
                "id": self.reply_to.id,
                "senderName": self.reply_to.sender.full_name if self.reply_to.sender else "Unknown user",
                "preview": (self.reply_to.content or "")[:140],
                "classId": self.reply_to.class_id,
            }
        elif self.reply_to_id is not None:
            payload["replyTo"] = {"id": self.reply_to_id, "removed": True}
        return payload

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<ChatMessage {self.id} class={self.class_id} sender={self.sender_id}>"


class ChatAttachment(db.Model):
    """A file attached to a chat message. Bytes live in the same private
    store as uploads (app/storage.py); `class_id` is denormalized so an
    attachment id from one class can never be served to another.

    `message_id` is NULL while pending upload (before the message commit);
    claiming validates class + uploader. Orphaned pending rows are cleaned
    opportunistically on the next upload by the same user.
    """

    __tablename__ = "chat_attachments"
    __table_args__ = (
        Index("ix_chat_attachments_message", "message_id"),
        Index("ix_chat_attachments_class", "class_id"),
        Index("ix_chat_attachments_pending", "message_id", "created_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(
        db.Integer,
        db.ForeignKey("chat_messages.id", ondelete="CASCADE"),
        nullable=True,
    )
    class_id = db.Column(
        db.Integer,
        db.ForeignKey("study_classes.id", ondelete="CASCADE"),
        nullable=False,
    )
    uploader_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(64), nullable=False, unique=True)
    mime_type = db.Column(db.String(120), nullable=False, default="application/octet-stream")
    size_bytes = db.Column(db.BigInteger, nullable=False, default=0)
    kind = db.Column(db.String(16), nullable=False, default="document")  # image | document | audio
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    message = db.relationship("ChatMessage", back_populates="attachments")
    uploader = db.relationship("User", foreign_keys=[uploader_id])

    def serialize(self):
        return {
            "id": self.id,
            "name": self.original_name,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "kind": self.kind,
            "createdAt": iso(self.created_at),
            "isOwn": None,
        }

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<ChatAttachment {self.id} {self.original_name!r} class={self.class_id}>"
