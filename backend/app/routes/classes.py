"""
Class collaboration routes (Part 2).

Covers Phases A–D: classes, membership, invitations, sharing, materials,
chat messages, attachments, presence heartbeats, and read tracking.

Authorization lives in the services — every route starts with
`login_required` and delegates to `require_membership`/`require_owner`, so a
hidden frontend button is never the only gate.
"""

from flask import Blueprint, current_app, jsonify, request, send_file

from app.auth import client_ip, current_user, login_required
from app.services import chat_service, class_service

bp = Blueprint("classes", __name__)


# ---------------------------------------------------------------------------
# Classes
# ---------------------------------------------------------------------------

@bp.post("/classes")
@login_required
def create_class():
    user = current_user()
    return jsonify({"class": class_service.create_class(user, request.get_json(silent=True))}), 201


@bp.get("/classes")
@login_required
def list_classes():
    return jsonify(class_service.list_classes(current_user()))


@bp.get("/classes/<int:class_id>")
@login_required
def get_class(class_id):
    return jsonify({"class": class_service.get_class_detail(current_user(), class_id)})


@bp.patch("/classes/<int:class_id>")
@login_required
def update_class(class_id):
    return jsonify({
        "class": class_service.update_class(current_user(), class_id, request.get_json(silent=True))
    })


@bp.delete("/classes/<int:class_id>")
@login_required
def delete_class(class_id):
    class_service.delete_class(current_user(), class_id)
    return "", 204


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

@bp.get("/classes/<int:class_id>/members")
@login_required
def list_members(class_id):
    return jsonify(class_service.list_members(current_user(), class_id))


@bp.post("/classes/<int:class_id>/leave")
@login_required
def leave_class(class_id):
    return jsonify(class_service.leave_class(current_user(), class_id))


@bp.delete("/classes/<int:class_id>/members/<int:member_id>")
@login_required
def remove_member(class_id, member_id):
    return jsonify(class_service.remove_member(current_user(), class_id, member_id))


@bp.post("/classes/<int:class_id>/transfer")
@login_required
def transfer_ownership(class_id):
    payload = request.get_json(silent=True) or {}
    return jsonify(class_service.transfer_ownership(
        current_user(), class_id, payload.get("memberId")
    ))


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

@bp.get("/classes/<int:class_id>/invitations")
@login_required
def list_invitations(class_id):
    return jsonify(class_service.list_invitations(current_user(), class_id))


@bp.post("/classes/<int:class_id>/invitations")
@login_required
def create_invitation(class_id):
    limiter = current_app.invite_limiter
    allowed, retry_after = limiter.check(f"invite:{current_user().id}:{client_ip()}")
    if not allowed:
        return jsonify({
            "message": f"Too many invitations requested. Try again in {retry_after}s.",
            "code": "rate_limited",
        }), 429
    return jsonify({
        "invitation": class_service.create_invitation(
            current_user(), class_id, request.get_json(silent=True)
        )
    }), 201


@bp.delete("/classes/<int:class_id>/invitations/<int:invitation_id>")
@login_required
def revoke_invitation(class_id, invitation_id):
    return jsonify(class_service.revoke_invitation(
        current_user(), class_id, invitation_id
    ))


@bp.get("/invitations/preview")
@login_required
def preview_invitation():
    token = request.args.get("token") or ""
    return jsonify(class_service.preview_invitation(current_user(), token))


@bp.post("/invitations/join")
@login_required
def join_class():
    limiter = current_app.invite_limiter
    allowed, retry_after = limiter.check(f"join:{current_user().id}:{client_ip()}")
    if not allowed:
        return jsonify({
            "message": f"Too many join attempts. Try again in {retry_after}s.",
            "code": "rate_limited",
        }), 429
    payload = request.get_json(silent=True) or {}
    return jsonify(class_service.join_class(current_user(), payload.get("token")))


# ---------------------------------------------------------------------------
# Sharing (personal -> class)
# ---------------------------------------------------------------------------

@bp.post("/shares")
@login_required
def share_resource():
    return jsonify(class_service.share_resource(current_user(), request.get_json(silent=True)))


@bp.post("/shares/unshare")
@login_required
def unshare_resource():
    return jsonify(class_service.unshare_resource(current_user(), request.get_json(silent=True)))


@bp.get("/classes/<int:class_id>/shared")
@login_required
def list_shared_resources(class_id):
    resource_type = request.args.get("type") or "file"
    return jsonify(class_service.list_shared_resources(
        current_user(), resource_type, class_id
    ))


@bp.get("/classes/<int:class_id>/materials")
@login_required
def list_class_materials(class_id):
    return jsonify(class_service.list_class_materials(
        current_user(), class_id, request.args
    ))


# ---------------------------------------------------------------------------
# Chat (Phases B–C)
# ---------------------------------------------------------------------------

@bp.get("/classes/<int:class_id>/messages")
@login_required
def list_messages(class_id):
    return jsonify(chat_service.list_messages(current_user(), class_id, request.args))


@bp.post("/classes/<int:class_id>/messages")
@login_required
def send_message(class_id):
    limiter = current_app.message_limiter
    allowed, retry_after = limiter.check(f"msg:{current_user().id}")
    if not allowed:
        return jsonify({
            "message": f"You are sending messages too quickly. Try again in {retry_after}s.",
            "code": "rate_limited",
        }), 429
    message = chat_service.send_message(
        current_user(), class_id, request.get_json(silent=True)
    )
    return jsonify({"message": message}), 201


@bp.patch("/messages/<int:message_id>")
@login_required
def edit_message(message_id):
    return jsonify({
        "message": chat_service.edit_message(
            current_user(), message_id, request.get_json(silent=True)
        )
    })


@bp.delete("/messages/<int:message_id>")
@login_required
def delete_message(message_id):
    return jsonify(chat_service.delete_message(current_user(), message_id))


@bp.post("/classes/<int:class_id>/attachments")
@login_required
def upload_attachment(class_id):
    limiter = current_app.upload_limiter
    allowed, retry_after = limiter.check(f"upload:{current_user().id}")
    if not allowed:
        return jsonify({
            "message": f"Too many uploads. Try again in {retry_after}s.",
            "code": "rate_limited",
        }), 429
    kind = request.form.get("kind")  # client hint only; server re-derives it
    attachment = chat_service.save_attachment(
        current_user(), class_id, request.files.get("file"), kind_hint=kind
    )
    return jsonify({"attachment": attachment}), 201


@bp.get("/attachments/<int:attachment_id>/content")
@login_required
def attachment_content(attachment_id):
    path, name, mime = chat_service.get_attachment_payload(
        current_user(), attachment_id, inline=True
    )
    return send_file(path, mimetype=mime, as_attachment=False, max_age=0)


@bp.get("/attachments/<int:attachment_id>/download")
@login_required
def attachment_download(attachment_id):
    path, name, mime = chat_service.get_attachment_payload(
        current_user(), attachment_id, inline=False
    )
    return send_file(
        path, mimetype=mime, as_attachment=True, download_name=name, max_age=0
    )


# ---------------------------------------------------------------------------
# Presence & read tracking (Phase D)
# ---------------------------------------------------------------------------

@bp.post("/classes/<int:class_id>/heartbeat")
@login_required
def heartbeat(class_id):
    user = current_user()
    class_service.require_membership(user, class_id)
    return jsonify(class_service.heartbeat_presence(class_id, user.id))


@bp.post("/classes/<int:class_id>/read")
@login_required
def mark_read(class_id):
    return jsonify(class_service.mark_read(current_user(), class_id))
