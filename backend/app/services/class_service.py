"""
Class collaboration service (Part 2): classes, membership, invitations,
resource sharing, class materials, and presence/unread bookkeeping.

Authorization model (enforced here, once, for every route):
  * owner      — created the class; manages settings, invitations, members,
                 moderation, ownership transfer.
  * member     — reads materials/messages, sends messages, uploads, leaves.
  * non-member — gets 404 for the class itself (no enumeration) and for
                 every protected sub-resource.

`require_membership` / `require_owner` are the single choke points; routes
never re-implement permission checks.

Presence is a single-process, in-memory heartbeat table (documented
limitation): a user counts as online for a class when a member heartbeat is
< PRESENCE_TTL_SECONDS old. It is keyed by (class_id, user_id) so multiple
tabs count once, and it is never persisted or fabricated.
"""

import secrets
import threading
import time
from datetime import timedelta

from sqlalchemy import func, select

from app.errors import ApiError
from app.extensions import db
from app.models import (
    ChatAttachment,
    ChatMessage,
    ClassInvitation,
    ClassMembership,
    Folder,
    Note,
    StudyClass,
    StudyFile,
    utcnow,
)
from app.validation import require_json_object

CLASS_NAME_MAX = 120
CLASS_DESC_MAX = 400
INVITATION_TTL_MAX_HOURS = 24 * 90
INVITATION_MAX_USES_LIMIT = 500

# Presence: per-process heartbeat table (single-instance deployment).
_PRESENCE_TTL_SECONDS = 90
_presence = {}  # (class_id, user_id) -> monotonic timestamp
_presence_lock = threading.Lock()


def hash_token(raw_token: str) -> str:
    """One-way hash for invitation tokens (never store the raw token)."""
    import hashlib

    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Authorization helpers — the single choke points
# ---------------------------------------------------------------------------

def get_class_or_404(class_id):
    study_class = db.session.get(StudyClass, class_id)
    if study_class is None:
        raise ApiError("Class not found.", 404)
    return study_class


def get_membership(class_id, user_id) -> ClassMembership | None:
    return db.session.execute(
        select(ClassMembership).where(
            ClassMembership.class_id == class_id,
            ClassMembership.user_id == user_id,
        )
    ).scalar_one_or_none()


def require_membership(user, class_id) -> ClassMembership:
    """Any current member. Non-members get 404 — never a 403 that would
    confirm the class exists."""
    membership = get_membership(class_id, user.id)
    if membership is None:
        raise ApiError("Class not found.", 404)
    return membership


def require_owner(user, class_id) -> ClassMembership:
    """Class owner only."""
    membership = require_membership(user, class_id)
    if membership.role != "owner":
        raise ApiError("Only the class owner can do that.", 403)
    return membership


def user_can_access_file(user, file_row) -> bool:
    """True when the user owns the file or is a member of the class it is
    shared with (directly or through an ancestor folder)."""
    if file_row.user_id == user.id:
        return True
    if file_row.deleted_at is not None:
        return False
    class_id = file_row.effective_class_id()
    if class_id is None:
        return False
    return get_membership(class_id, user.id) is not None


def user_can_access_note(user, note) -> bool:
    if note.user_id == user.id:
        return True
    if note.shared_class_id is None:
        return False
    return get_membership(note.shared_class_id, user.id) is not None


# ---------------------------------------------------------------------------
# Presence (single-process heartbeat store)
# ---------------------------------------------------------------------------

def heartbeat_presence(class_id, user_id) -> dict:
    """Record a member heartbeat; returns online users for the class.
    The caller has already passed require_membership — presence is never
    recorded for non-members."""
    now = time.monotonic()
    with _presence_lock:
        _presence[(class_id, user_id)] = now
    return {"onlineUserIds": online_user_ids(class_id), "ttlSeconds": _PRESENCE_TTL_SECONDS}


def online_user_ids(class_id) -> list[int]:
    """Unique users with a heartbeat younger than the TTL, pruned of stale
    entries. The membership filter keeps removed members from lingering."""
    now = time.monotonic()
    with _presence_lock:
        stale = [
            key for key, ts in _presence.items()
            if key[0] == class_id and now - ts > _PRESENCE_TTL_SECONDS
        ]
        for key in stale:
            _presence.pop(key, None)
        candidate_ids = {uid for (cid, uid) in _presence if cid == class_id}
    if not candidate_ids:
        return []
    member_ids = set(
        db.session.execute(
            select(ClassMembership.user_id).where(ClassMembership.class_id == class_id)
        ).scalars()
    )
    return sorted(candidate_ids & member_ids)


def drop_presence_for(class_id, user_id=None):
    """Forget presence after a member leaves or a class is deleted."""
    with _presence_lock:
        if user_id is None:
            for key in [k for k in _presence if k[0] == class_id]:
                _presence.pop(key, None)
        else:
            _presence.pop((class_id, user_id), None)


# ---------------------------------------------------------------------------
# Class CRUD
# ---------------------------------------------------------------------------

def _validate_class_payload(payload, *, partial=False):
    payload = require_json_object(payload)
    data = {}
    if not partial or "name" in payload:
        name = " ".join(str(payload.get("name") or "").split())
        if not name:
            raise ApiError("A class name is required.", 422, details={"field": "name"})
        if len(name) > CLASS_NAME_MAX:
            raise ApiError(
                f"Class name must be {CLASS_NAME_MAX} characters or fewer.",
                422, details={"field": "name"},
            )
        data["name"] = name
    if "description" in payload:
        description = " ".join(str(payload.get("description") or "").split())
        if len(description) > CLASS_DESC_MAX:
            raise ApiError(
                f"Description must be {CLASS_DESC_MAX} characters or fewer.",
                422, details={"field": "description"},
            )
        data["description"] = description
    return data


def create_class(user, payload):
    data = _validate_class_payload(payload)
    study_class = StudyClass(
        owner_id=user.id,
        name=data["name"],
        description=data.get("description", ""),
    )
    db.session.add(study_class)
    db.session.flush()
    db.session.add(ClassMembership(class_id=study_class.id, user_id=user.id, role="owner"))
    db.session.commit()
    return study_class.serialize(member_count=1, my_role="owner", unread=0)


def list_classes(user):
    """Every class the user belongs to, with member and unread counts."""
    rows = db.session.execute(
        select(ClassMembership, StudyClass)
        .join(StudyClass, StudyClass.id == ClassMembership.class_id)
        .where(ClassMembership.user_id == user.id)
        .order_by(StudyClass.created_at.desc())
    ).all()
    if not rows:
        return {"classes": []}

    class_ids = [study_class.id for _, study_class in rows]
    member_counts = dict(
        db.session.execute(
            select(ClassMembership.class_id, func.count(ClassMembership.id))
            .where(ClassMembership.class_id.in_(class_ids))
            .group_by(ClassMembership.class_id)
        ).all()
    )
    unread = unread_counts(user, class_ids)

    classes = []
    for membership, study_class in rows:
        classes.append(
            study_class.serialize(
                member_count=member_counts.get(study_class.id, 1),
                unread=unread.get(study_class.id, 0),
                my_role=membership.role,
                joined_at=membership.joined_at,
            )
        )
    return {"classes": classes}


def get_class_detail(user, class_id):
    membership = require_membership(user, class_id)
    study_class = get_class_or_404(class_id)
    member_count = db.session.execute(
        select(func.count(ClassMembership.id)).where(ClassMembership.class_id == class_id)
    ).scalar_one()
    unread = unread_counts(user, [class_id]).get(class_id, 0)
    return study_class.serialize(
        member_count=member_count,
        my_role=membership.role,
        unread=unread,
        joined_at=membership.joined_at,
    )


def update_class(user, class_id, payload):
    require_owner(user, class_id)
    data = _validate_class_payload(payload, partial=True)
    if not data:
        raise ApiError("Nothing to update.", 400)
    study_class = get_class_or_404(class_id)
    for key, value in data.items():
        setattr(study_class, key, value)
    db.session.commit()
    return study_class.serialize()


def delete_class(user, class_id):
    """Owner-only. Deleting the class removes memberships, invitations, chat
    history and class attachments; shared resources revert to private via
    the SET NULL foreign keys — personal data is never deleted."""
    require_owner(user, class_id)
    study_class = get_class_or_404(class_id)
    attachment_rows = db.session.execute(
        select(ChatAttachment).where(ChatAttachment.class_id == class_id)
    ).scalars().all()
    db.session.delete(study_class)
    db.session.commit()
    drop_presence_for(class_id)
    from app import storage  # local import avoids cycles

    for attachment in attachment_rows:
        storage.delete(attachment.stored_name)


# ---------------------------------------------------------------------------
# Membership: members list, leave, remove, transfer
# ---------------------------------------------------------------------------

def list_members(user, class_id):
    require_membership(user, class_id)
    memberships = db.session.execute(
        select(ClassMembership).where(ClassMembership.class_id == class_id)
    ).scalars().all()
    online = set(online_user_ids(class_id))
    members = []
    for membership in sorted(memberships, key=lambda m: (m.role != "owner", m.joined_at)):
        payload = membership.serialize()
        payload["isOnline"] = membership.user_id in online
        members.append(payload)
    online_count = sum(1 for m in members if m["isOnline"])
    return {"members": members, "onlineCount": online_count}


def leave_class(user, class_id):
    """A member leaves; the owner must transfer ownership first (safeguard
    against an ownerless class)."""
    membership = require_membership(user, class_id)
    if membership.role == "owner":
        member_count = db.session.execute(
            select(func.count(ClassMembership.id)).where(ClassMembership.class_id == class_id)
        ).scalar_one()
        if member_count > 1:
            raise ApiError(
                "Transfer ownership to another member before leaving the class.",
                409, code="transfer_required",
            )
        # Sole member: the class would be empty — allow deleting it instead.
        raise ApiError(
            "You are the only member. Delete the class instead of leaving it.",
            409, code="delete_class_instead",
        )
    db.session.delete(membership)
    db.session.commit()
    drop_presence_for(class_id, user.id)
    return {"left": True}


def remove_member(user, class_id, member_id):
    """Owner removes a member (not themselves; ownership transfer is the
    sanctioned way to hand the class over)."""
    require_owner(user, class_id)
    membership = get_membership(class_id, member_id)
    if membership is None:
        raise ApiError("That member is not in this class.", 404)
    if membership.role == "owner":
        raise ApiError("The owner cannot be removed. Transfer ownership first.", 409)
    db.session.delete(membership)
    db.session.commit()
    drop_presence_for(class_id, member_id)
    return {"removed": True}


def transfer_ownership(user, class_id, member_id):
    membership = require_owner(user, class_id)
    target = get_membership(class_id, member_id)
    if target is None or target.user_id == user.id:
        raise ApiError("Choose another member to become the owner.", 422)
    target.role = "owner"
    membership.role = "member"
    study_class = get_class_or_404(class_id)
    study_class.owner_id = target.user_id
    db.session.commit()
    return {"transferred": True, "newOwnerId": target.user_id}


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

def create_invitation(user, class_id, payload):
    """Owner-only. Returns the RAW token exactly once; only its hash is
    stored. Optional hours-to-expiry and max-uses."""
    require_owner(user, class_id)
    payload = require_json_object(payload or {})

    hours = payload.get("expiresInHours")
    expires_at = None
    if hours not in (None, ""):
        try:
            hours = int(hours)
        except (TypeError, ValueError):
            raise ApiError("Invalid expiry.", 422, details={"field": "expiresInHours"}) from None
        if hours < 1 or hours > INVITATION_TTL_MAX_HOURS:
            raise ApiError(
                f"Expiry must be between 1 hour and {INVITATION_TTL_MAX_HOURS} hours.",
                422, details={"field": "expiresInHours"},
            )
        expires_at = utcnow() + timedelta(hours=hours)

    max_uses = payload.get("maxUses")
    if max_uses not in (None, ""):
        try:
            max_uses = int(max_uses)
        except (TypeError, ValueError):
            raise ApiError("Invalid usage limit.", 422, details={"field": "maxUses"}) from None
        if max_uses < 1 or max_uses > INVITATION_MAX_USES_LIMIT:
            raise ApiError(
                f"Usage limit must be between 1 and {INVITATION_MAX_USES_LIMIT}.",
                422, details={"field": "maxUses"},
            )

    raw_token = secrets.token_urlsafe(24)
    invitation = ClassInvitation(
        class_id=class_id,
        token_hash=hash_token(raw_token),
        created_by=user.id,
        expires_at=expires_at,
        max_uses=max_uses,
    )
    db.session.add(invitation)
    db.session.commit()
    payload_out = invitation.serialize()
    payload_out["token"] = raw_token  # shown once, never re-fetchable
    return payload_out


def list_invitations(user, class_id):
    require_owner(user, class_id)
    invitations = db.session.execute(
        select(ClassInvitation)
        .where(ClassInvitation.class_id == class_id)
        .order_by(ClassInvitation.created_at.desc())
    ).scalars().all()
    return {"invitations": [invitation.serialize() for invitation in invitations]}


def revoke_invitation(user, class_id, invitation_id):
    require_owner(user, class_id)
    invitation = db.session.get(ClassInvitation, invitation_id)
    if invitation is None or invitation.class_id != class_id:
        raise ApiError("Invitation not found.", 404)
    if invitation.revoked_at is None:
        invitation.revoked_at = utcnow()
        db.session.commit()
    return invitation.serialize()


def preview_invitation(user, raw_token):
    """Validate a token and reveal only safe class details so the joining
    student can confirm. Requires sign-in; never leaks member lists."""
    if not raw_token or not isinstance(raw_token, str) or len(raw_token) > 256:
        raise ApiError("This invitation link is not valid.", 404)
    invitation = db.session.execute(
        select(ClassInvitation).where(ClassInvitation.token_hash == hash_token(raw_token))
    ).scalar_one_or_none()
    if invitation is None:
        raise ApiError("This invitation is not valid or has already been used.", 404)
    if invitation.status != "active":
        raise ApiError(f"This invitation is {invitation.status}.", 409)
    study_class = db.session.get(StudyClass, invitation.class_id)
    if study_class is None:
        raise ApiError("This invitation is not valid or has already been used.", 404)
    from app.models import User

    is_member = get_membership(study_class.id, user.id) is not None
    owner = db.session.get(User, study_class.owner_id)
    return {
        "class": {
            "id": study_class.id,
            "name": study_class.name,
            "description": study_class.description or "",
            "ownerName": owner.full_name if owner else "Unknown",
        },
        "expiresAt": invitation.serialize()["expiresAt"],
        "alreadyMember": is_member,
    }


def join_class(user, raw_token):
    """Validate the invitation and create the membership atomically.

    Duplicate protection is two-layered: the unique (class, user) constraint
    in the database, and this pre-check. The use_count increment is done with
    an atomic UPDATE guarded by the usage limit, so concurrent joins cannot
    exceed max_uses.
    """
    if not raw_token or not isinstance(raw_token, str) or len(raw_token) > 256:
        raise ApiError("This invitation link is not valid.", 404)

    invitation = db.session.execute(
        select(ClassInvitation)
        .where(ClassInvitation.token_hash == hash_token(raw_token))
        .with_for_update()
    ).scalar_one_or_none()
    if invitation is None or invitation.status != "active":
        raise ApiError("This invitation is not valid or has already been used.", 404)

    existing = get_membership(invitation.class_id, user.id)
    if existing is not None:
        study_class = db.session.get(StudyClass, invitation.class_id)
        return {
            "joined": False,
            "alreadyMember": True,
            "class": study_class.serialize(my_role=existing.role) if study_class else None,
        }

    # Atomic, limit-guarded claim of one invitation use.
    claimed = db.session.execute(
        db.update(ClassInvitation)
        .where(
            ClassInvitation.id == invitation.id,
            ClassInvitation.revoked_at.is_(None),
            (ClassInvitation.max_uses.is_(None)) |
            (ClassInvitation.use_count < ClassInvitation.max_uses),
        )
        .values(use_count=ClassInvitation.use_count + 1)
    ).rowcount
    if claimed == 0:
        raise ApiError("This invitation has reached its usage limit.", 409)

    try:
        db.session.add(ClassMembership(
            class_id=invitation.class_id, user_id=user.id, role="member",
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()
        # A concurrent join won the race on the unique constraint; treat it
        # as an idempotent success, not an error.
        existing = get_membership(invitation.class_id, user.id)
        if existing is not None:
            study_class = db.session.get(StudyClass, invitation.class_id)
            return {
                "joined": False,
                "alreadyMember": True,
                "class": study_class.serialize(my_role=existing.role) if study_class else None,
            }
        raise

    study_class = db.session.get(StudyClass, invitation.class_id)
    return {
        "joined": True,
        "alreadyMember": False,
        "class": study_class.serialize(my_role="member", unread=0) if study_class else None,
    }


# ---------------------------------------------------------------------------
# Resource sharing (personal -> class)
# ---------------------------------------------------------------------------

_SHARED_TYPES = {"file": StudyFile, "folder": Folder, "note": Note}


def _owned_resource(user, resource_type, resource_id):
    model = _SHARED_TYPES.get(resource_type)
    if model is None:
        raise ApiError("Resource type must be file, folder, or note.", 422)
    resource = db.session.get(model, resource_id)
    if resource is None or resource.user_id != user.id:
        # 404, not 403: never confirm another user's resource exists.
        raise ApiError("Not found.", 404)
    return resource


def share_resource(user, payload):
    """Share one owned file/folder/note with a class the user belongs to."""
    payload = require_json_object(payload)
    resource_type = str(payload.get("resourceType") or "").lower()
    resource_id = payload.get("resourceId")
    class_id = payload.get("classId")
    if not isinstance(resource_id, int) or not isinstance(class_id, int):
        raise ApiError("resourceId and classId are required.", 422)

    require_membership(user, class_id)
    resource = _owned_resource(user, resource_type, resource_id)
    resource.shared_class_id = class_id
    db.session.commit()
    return {"shared": True, "classId": class_id}


def unshare_resource(user, payload):
    """Revoke the class share on one owned resource (it becomes private)."""
    payload = require_json_object(payload)
    resource_type = str(payload.get("resourceType") or "").lower()
    resource_id = payload.get("resourceId")
    if not isinstance(resource_id, int):
        raise ApiError("resourceId is required.", 422)
    resource = _owned_resource(user, resource_type, resource_id)
    resource.shared_class_id = None
    db.session.commit()
    return {"shared": False}


def list_shared_resources(user, resource_type, class_id):
    """Everything the USER has shared with this class (for the share dialog
    and the class's materials management view)."""
    require_membership(user, class_id)
    model = _SHARED_TYPES.get(resource_type)
    if model is None:
        raise ApiError("Resource type must be file, folder, or note.", 422)
    rows = db.session.execute(
        select(model).where(model.user_id == user.id, model.shared_class_id == class_id)
    ).scalars().all()
    return {"resources": [row.serialize() for row in rows]}


# ---------------------------------------------------------------------------
# Class materials (read view for every member)
# ---------------------------------------------------------------------------

def _shared_folder_ids(class_id) -> list[int]:
    """Folders explicitly shared with the class (any member's)."""
    return list(db.session.execute(
        select(Folder.id).where(Folder.shared_class_id == class_id)
    ).scalars())


def _descendant_folder_ids(class_id) -> set[int]:
    """Closure: every folder under a shared folder inherits the share — this
    is the documented, enforced inheritance rule."""
    root_ids = _shared_folder_ids(class_id)
    if not root_ids:
        return set()
    visible = set(root_ids)
    frontier = list(root_ids)
    while frontier:
        rows = db.session.execute(
            select(Folder.id).where(Folder.parent_id.in_(frontier))
        ).scalars().all()
        frontier = [row for row in rows if row not in visible]
        visible.update(frontier)
    return visible


def list_class_materials(user, class_id, args):
    """Files + folders + notes shared with this class, searchable/sortable."""
    require_membership(user, class_id)
    search = str(args.get("q") or "").strip()

    folder_ids = _descendant_folder_ids(class_id)

    file_query = select(StudyFile).where(StudyFile.deleted_at.is_(None))
    if folder_ids:
        file_query = file_query.where(
            (StudyFile.shared_class_id == class_id) |
            (StudyFile.folder_id.in_(folder_ids))
        )
    else:
        file_query = file_query.where(StudyFile.shared_class_id == class_id)
    if search:
        file_query = file_query.where(StudyFile.original_name.ilike(f"%{search}%"))
    file_query = file_query.order_by(StudyFile.created_at.desc()).limit(200)
    files = db.session.execute(file_query).scalars().all()

    folder_rows = db.session.execute(
        select(Folder).where(Folder.id.in_(folder_ids)) if folder_ids
        else select(Folder).where(sa_false())
    ).scalars().all()

    notes_query = select(Note).where(Note.shared_class_id == class_id)
    if search:
        notes_query = notes_query.where(Note.title.ilike(f"%{search}%"))
    notes_query = notes_query.order_by(Note.updated_at.desc()).limit(200)
    notes = db.session.execute(notes_query).scalars().all()

    return {
        "files": [row.serialize() for row in files],
        "folders": [row.serialize() for row in folder_rows],
        "notes": [row.serialize() for row in notes],
    }


def sa_false():
    from sqlalchemy import false

    return false()


# ---------------------------------------------------------------------------
# Unread bookkeeping
# ---------------------------------------------------------------------------

def unread_counts(user, class_ids) -> dict[int, int]:
    """Messages newer than each membership's last_read_at, excluding the
    user's own messages and tombstones."""
    if not class_ids:
        return {}
    memberships = db.session.execute(
        select(ClassMembership).where(
            ClassMembership.user_id == user.id,
            ClassMembership.class_id.in_(class_ids),
        )
    ).scalars().all()
    counts = {}
    for membership in memberships:
        query = select(func.count(ChatMessage.id)).where(
            ChatMessage.class_id == membership.class_id,
            ChatMessage.sender_id != user.id,
            ChatMessage.is_deleted.is_(False),
        )
        if membership.last_read_at is not None:
            query = query.where(ChatMessage.created_at > membership.last_read_at)
        counts[membership.class_id] = db.session.execute(query).scalar_one()
    return counts


def mark_read(user, class_id):
    """Advance last_read_at to now (idempotent)."""
    membership = require_membership(user, class_id)
    membership.last_read_at = utcnow()
    db.session.commit()
    return {"unread": 0}
