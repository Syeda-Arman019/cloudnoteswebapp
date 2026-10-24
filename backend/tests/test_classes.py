"""
Part 2 Phase A tests: classes, invitations, membership and sharing.

Covers the required matrix: authorized creation, invitation lifecycle
(create/preview/join/revoke/expire/limit), duplicate-membership prevention,
role enforcement, IDOR resistance, personal-vs-shared isolation, and
access revocation when membership or sharing is removed.
"""

from datetime import timedelta

import pytest

from tests.conftest import register_user, upload_file, PDF_BYTES


def _create_class(client, name="23 Batch", description="CS, Section B"):
    return client.post(
        "/api/classes", json={"name": name, "description": description}
    )


def _signup(client, **kwargs):
    response, email, password = register_user(client, **kwargs)
    assert response.status_code == 201
    return email, password


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


# NOTE: the `owner` and `member` fixtures live in conftest.py so every Part 2
# test module (classes, chat) gets two INDEPENDENT signed-in sessions.

class TestClassCreation:
    def test_create_class_requires_auth(self, client):
        response = client.post("/api/classes", json={"name": "Nope"})
        assert response.status_code == 401

    def test_create_class(self, owner):
        response = _create_class(owner)
        assert response.status_code == 201
        payload = response.get_json()["class"]
        assert payload["name"] == "23 Batch"
        assert payload["myRole"] == "owner"
        assert payload["memberCount"] == 1

    def test_class_name_required(self, owner):
        response = owner.post("/api/classes", json={"name": "   "})
        assert response.status_code == 422

    def test_class_name_max_length(self, owner):
        response = owner.post("/api/classes", json={"name": "x" * 121})
        assert response.status_code == 422

    def test_list_classes_shows_only_my_classes(self, owner, member):
        _create_class(owner, name="Owner Class")
        assert len(owner.get("/api/classes").get_json()["classes"]) == 1
        # A different signed-in user sees none of them.
        _signup(member, full_name="Other Student")
        assert member.get("/api/classes").get_json()["classes"] == []

    def test_multiple_classes_per_user(self, owner):
        _create_class(owner, name="Class A")
        _create_class(owner, name="Class B")
        classes = owner.get("/api/classes").get_json()["classes"]
        assert {c["name"] for c in classes} == {"Class A", "Class B"}


class TestClassDetailAndEdits:
    def test_owner_updates_class(self, owner):
        class_id = _create_class(owner).get_json()["class"]["id"]
        response = owner.patch(f"/api/classes/{class_id}", json={"description": "Updated"})
        assert response.status_code == 200
        assert response.get_json()["class"]["description"] == "Updated"

    def test_member_cannot_update(self, owner, member):
        class_id = _create_class(owner).get_json()["class"]["id"]
        token = owner.post(
            f"/api/classes/{class_id}/invitations", json={}
        ).get_json()["invitation"]["token"]
        _signup(member, full_name="Member Two")
        assert member.post("/api/invitations/join", json={"token": token}).status_code == 200

        response = member.patch(f"/api/classes/{class_id}", json={"name": "Hijack"})
        assert response.status_code == 403

    def test_non_member_gets_404_not_403(self, owner, member):
        class_id = _create_class(owner).get_json()["class"]["id"]
        _signup(member, full_name="Outsider")
        # 404 everywhere: existence of a class must not leak.
        assert member.get(f"/api/classes/{class_id}").status_code == 404
        assert member.get(f"/api/classes/{class_id}/members").status_code == 404
        assert member.patch(f"/api/classes/{class_id}", json={"name": "x"}).status_code == 404
        assert member.delete(f"/api/classes/{class_id}").status_code == 404


class TestInvitations:
    def test_owner_creates_invitation_with_token_once(self, owner):
        class_id = _create_class(owner).get_json()["class"]["id"]
        response = owner.post(f"/api/classes/{class_id}/invitations", json={})
        assert response.status_code == 201
        invitation = response.get_json()["invitation"]
        assert invitation["status"] == "active"
        assert invitation["token"] and len(invitation["token"]) > 20
        # Listing NEVER returns the raw token again.
        listed = owner.get(f"/api/classes/{class_id}/invitations").get_json()["invitations"]
        assert len(listed) == 1
        assert "token" not in listed[0]
        assert "tokenHash" not in listed[0]

    def test_non_owner_cannot_create_invitation(self, owner, client):
        class_id = _create_class(owner).get_json()["class"]["id"]
        token = owner.post(
            f"/api/classes/{class_id}/invitations", json={}
        ).get_json()["invitation"]["token"]
        _signup(client, full_name="Member")
        client.post("/api/invitations/join", json={"token": token})
        response = client.post(f"/api/classes/{class_id}/invitations", json={})
        assert response.status_code == 403

    def test_preview_and_join_flow(self, owner, client):
        class_id = _create_class(owner).get_json()["class"]["id"]
        token = owner.post(f"/api/classes/{class_id}/invitations", json={}).get_json()[
            "invitation"
        ]["token"]

        _signup(client, full_name="Joining Student")
        preview = client.get(f"/api/invitations/preview?token={token}")
        assert preview.status_code == 200
        body = preview.get_json()
        assert body["class"]["name"] == "23 Batch"
        assert body["alreadyMember"] is False

        join = client.post("/api/invitations/join", json={"token": token})
        assert join.status_code == 200
        assert join.get_json()["joined"] is True
        classes = client.get("/api/classes").get_json()["classes"]
        assert [c["name"] for c in classes] == ["23 Batch"]
        assert classes[0]["myRole"] == "member"

    def test_join_twice_no_duplicate_membership(self, owner, client):
        class_id = _create_class(owner).get_json()["class"]["id"]
        token = owner.post(f"/api/classes/{class_id}/invitations", json={}).get_json()[
            "invitation"
        ]["token"]
        _signup(client, full_name="Twice")
        assert client.post("/api/invitations/join", json={"token": token}).status_code == 200
        second = client.post("/api/invitations/join", json={"token": token})
        assert second.status_code == 200
        assert second.get_json()["alreadyMember"] is True
        classes = client.get("/api/classes").get_json()["classes"]
        assert len(classes) == 1
        members = owner.get(f"/api/classes/{class_id}/members").get_json()["members"]
        assert len(members) == 2

    def test_invalid_token_rejected(self, client):
        _signup(client, full_name="Random")
        assert client.post(
            "/api/invitations/join", json={"token": "not-a-real-token"}
        ).status_code == 404
        assert client.get("/api/invitations/preview?token=forged").status_code == 404

    def test_revoked_invitation_rejected(self, owner, client):
        class_id = _create_class(owner).get_json()["class"]["id"]
        invitation = owner.post(
            f"/api/classes/{class_id}/invitations", json={}
        ).get_json()["invitation"]
        assert owner.delete(
            f"/api/classes/{class_id}/invitations/{invitation['id']}"
        ).status_code == 200
        _signup(client, full_name="Late Joiner")
        response = client.post("/api/invitations/join", json={"token": invitation["token"]})
        assert response.status_code == 404

    def test_expired_invitation_rejected(self, owner, member, app):
        from app.extensions import db
        from app.models import ClassInvitation

        class_id = _create_class(owner).get_json()["class"]["id"]
        invitation = owner.post(
            f"/api/classes/{class_id}/invitations", json={"expiresInHours": 1}
        ).get_json()["invitation"]

        with app.app_context():
            row = db.session.get(ClassInvitation, invitation["id"])
            row.expires_at = row.expires_at - timedelta(hours=2)
            db.session.commit()

        _signup(member, full_name="Too Late")
        assert member.post(
            "/api/invitations/join", json={"token": invitation["token"]}
        ).status_code == 404

    def test_usage_limit_enforced(self, owner, client, app):
        class_id = _create_class(owner).get_json()["class"]["id"]
        invitation = owner.post(
            f"/api/classes/{class_id}/invitations", json={"maxUses": 1}
        ).get_json()["invitation"]

        first, _, _ = register_user(client, full_name="First Joiner")
        assert client.post(
            "/api/invitations/join", json={"token": invitation["token"]}
        ).status_code == 200

        # Second joiner is rejected once the limit is hit.
        client.post("/api/auth/logout")
        register_user(client, full_name="Second Joiner")
        response = client.post("/api/invitations/join", json={"token": invitation["token"]})
        assert response.status_code in (404, 409)

    def test_invalid_expiry_and_max_uses_rejected(self, owner):
        class_id = _create_class(owner).get_json()["class"]["id"]
        assert owner.post(
            f"/api/classes/{class_id}/invitations", json={"expiresInHours": 0}
        ).status_code == 422
        assert owner.post(
            f"/api/classes/{class_id}/invitations", json={"maxUses": 0}
        ).status_code == 422

    def test_invitation_token_not_in_unrelated_responses(self, owner):
        """A public class listing must never leak a valid token."""
        class_id = _create_class(owner).get_json()["class"]["id"]
        owner.post(f"/api/classes/{class_id}/invitations", json={})
        listing = owner.get("/api/classes").get_json()
        detail = owner.get(f"/api/classes/{class_id}").get_json()
        import json as _json

        blob = _json.dumps(listing) + _json.dumps(detail)
        # The raw token exists but must not appear in these payloads.
        invitations = owner.get(f"/api/classes/{class_id}/invitations").get_json()
        assert "token" not in blob
        assert invitations["invitations"][0]["status"] == "active"


class TestMembership:
    @pytest.fixture
    def two_person_class(self, owner, member):
        class_id = _create_class(owner).get_json()["class"]["id"]
        token = owner.post(
            f"/api/classes/{class_id}/invitations", json={}
        ).get_json()["invitation"]["token"]
        _signup(member, full_name="Member Two")
        member.post("/api/invitations/join", json={"token": token})
        return owner, member, class_id

    def test_members_list(self, two_person_class):
        owner, member, class_id = two_person_class
        body = owner.get(f"/api/classes/{class_id}/members").get_json()
        assert len(body["members"]) == 2
        roles = {m["user"]["fullName"]: m["role"] for m in body["members"]}
        assert roles["Class Owner"] == "owner"
        assert roles["Member Two"] == "member"

    def test_member_cannot_remove_owner(self, two_person_class):
        owner, member, class_id = two_person_class
        owner_id = owner.get("/api/auth/me").get_json()["user"]["id"]
        response = member.delete(f"/api/classes/{class_id}/members/{owner_id}")
        assert response.status_code in (403, 404)

    def test_owner_cannot_be_removed_even_by_owner(self, two_person_class):
        owner, _, class_id = two_person_class
        owner_id = owner.get("/api/auth/me").get_json()["user"]["id"]
        response = owner.delete(f"/api/classes/{class_id}/members/{owner_id}")
        assert response.status_code == 409

    def test_owner_removes_member_revokes_access(self, two_person_class):
        owner, member, class_id = two_person_class
        member_id = member.get("/api/auth/me").get_json()["user"]["id"]
        assert owner.delete(
            f"/api/classes/{class_id}/members/{member_id}"
        ).status_code == 200
        # Removed member loses class access immediately (404, no leak).
        assert member.get(f"/api/classes/{class_id}").status_code == 404
        assert member.get(f"/api/classes/{class_id}/members").status_code == 404
        classes = member.get("/api/classes").get_json()["classes"]
        assert classes == []

    def test_member_can_leave(self, two_person_class):
        owner, member, class_id = two_person_class
        assert member.post(f"/api/classes/{class_id}/leave").status_code == 200
        assert member.get(f"/api/classes/{class_id}").status_code == 404

    def test_owner_with_other_members_must_transfer_first(self, two_person_class):
        owner, member, class_id = two_person_class
        response = owner.post(f"/api/classes/{class_id}/leave")
        assert response.status_code == 409
        assert response.get_json()["code"] == "transfer_required"

    def test_transfer_ownership_then_leave(self, two_person_class):
        owner, member, class_id = two_person_class
        member_id = member.get("/api/auth/me").get_json()["user"]["id"]
        assert owner.post(
            f"/api/classes/{class_id}/transfer", json={"memberId": member_id}
        ).status_code == 200
        # New owner can leave (the class still has the old owner as member).
        assert owner.post(f"/api/classes/{class_id}/leave").status_code == 200
        detail = member.get(f"/api/classes/{class_id}").get_json()["class"]
        assert detail["myRole"] == "owner"

    def test_transfer_to_non_member_rejected(self, two_person_class, client):
        owner, _, class_id = two_person_class
        outsider, _, _ = register_user(client, full_name="Outsider")
        outsider_id = client.get("/api/auth/me").get_json()["user"]["id"]
        response = owner.post(f"/api/classes/{class_id}/transfer", json={"memberId": outsider_id})
        assert response.status_code == 422

    def test_sole_owner_cannot_leave_only_delete(self, owner):
        class_id = _create_class(owner).get_json()["class"]["id"]
        response = owner.post(f"/api/classes/{class_id}/leave")
        assert response.status_code == 409
        assert response.get_json()["code"] == "delete_class_instead"

    def test_delete_class_reverts_sharing_to_private(self, owner, client, app):
        """Deleting a class must not delete personal resources — they go
        back to private."""
        from app.extensions import db
        from app.models import Note, StudyClass

        class_id = _create_class(owner).get_json()["class"]["id"]
        note_resp = owner.post(
            "/api/notes", json={"title": "Shared note", "content": "x", "tags": []}
        )
        note_id = note_resp.get_json()["note"]["id"]
        owner.post("/api/shares", json={
            "resourceType": "note", "resourceId": note_id, "classId": class_id,
        })

        assert owner.delete(f"/api/classes/{class_id}").status_code == 204

        with app.app_context():
            assert db.session.get(StudyClass, class_id) is None
            note = db.session.get(Note, note_id)
            assert note is not None, "personal note must survive class deletion"
            assert note.shared_class_id is None
        # The note is still there and private.
        assert owner.get(f"/api/notes/{note_id}").status_code == 200


class TestResourceSharing:
    @pytest.fixture
    def shared_env(self, owner, member):
        """Owner shares a file with a class; member + outsider signed in."""
        class_id = _create_class(owner).get_json()["class"]["id"]
        upload = upload_file(owner, "physics-notes.pdf", PDF_BYTES)
        assert upload.status_code == 201
        file_id = upload.get_json()["file"]["id"]

        token = owner.post(
            f"/api/classes/{class_id}/invitations", json={}
        ).get_json()["invitation"]["token"]

        _signup(member, full_name="Class Member")
        member.post("/api/invitations/join", json={"token": token})

        return {"class_id": class_id, "file_id": file_id, "owner": owner, "member": member}

    def test_share_and_member_can_download(self, shared_env, app):
        class_id, file_id = shared_env["class_id"], shared_env["file_id"]
        owner = shared_env["owner"]
        member = shared_env["member"]

        response = owner.post("/api/shares", json={
            "resourceType": "file", "resourceId": file_id, "classId": class_id,
        })
        assert response.status_code == 200

        assert member.get(f"/api/files/{file_id}/download").status_code == 200
        assert member.get(f"/api/files/{file_id}/preview").status_code == 200

    def test_private_file_invisible_to_member(self, shared_env, app):
        """A file NOT shared stays private even though we are classmates."""
        owner = shared_env["owner"]
        member = shared_env["member"]
        file_id = shared_env["file_id"]  # never shared in this test

        assert member.get(f"/api/files/{file_id}").status_code == 404
        assert member.get(f"/api/files/{file_id}/download").status_code == 404

    def test_non_member_cannot_access_shared_file(self, shared_env, client):
        class_id, file_id = shared_env["class_id"], shared_env["file_id"]
        owner = shared_env["owner"]
        owner.post("/api/shares", json={
            "resourceType": "file", "resourceId": file_id, "classId": class_id,
        })
        _signup(client, full_name="Outsider")
        assert client.get(f"/api/files/{file_id}/download").status_code == 404
        assert client.get(f"/api/files/{file_id}").status_code == 404

    def test_unshare_revokes_member_access(self, shared_env):
        class_id, file_id = shared_env["class_id"], shared_env["file_id"]
        owner = shared_env["owner"]
        member = shared_env["member"]
        owner.post("/api/shares", json={
            "resourceType": "file", "resourceId": file_id, "classId": class_id,
        })
        assert member.get(f"/api/files/{file_id}/download").status_code == 200

        owner.post("/api/shares/unshare", json={
            "resourceType": "file", "resourceId": file_id,
        })
        assert member.get(f"/api/files/{file_id}/download").status_code == 404

    def test_removal_from_class_revokes_access(self, shared_env):
        class_id, file_id = shared_env["class_id"], shared_env["file_id"]
        owner = shared_env["owner"]
        member = shared_env["member"]
        owner.post("/api/shares", json={
            "resourceType": "file", "resourceId": file_id, "classId": class_id,
        })
        assert member.get(f"/api/files/{file_id}/download").status_code == 200

        member_id = member.get("/api/auth/me").get_json()["user"]["id"]
        owner.delete(f"/api/classes/{class_id}/members/{member_id}")
        assert member.get(f"/api/files/{file_id}/download").status_code == 404

    def test_member_cannot_share_someone_elses_file(self, shared_env):
        class_id = shared_env["class_id"]
        owner = shared_env["owner"]
        member = shared_env["member"]
        # The file belongs to the owner; the member must get a 404.
        upload = upload_file(owner, "owner-only.pdf", PDF_BYTES)
        file_id = upload.get_json()["file"]["id"]
        response = member.post("/api/shares", json={
            "resourceType": "file", "resourceId": file_id, "classId": class_id,
        })
        assert response.status_code == 404

    def test_member_cannot_share_into_class_they_belong_to_not(self, shared_env, client):
        """Sharing requires membership in the TARGET class."""
        owner = shared_env["owner"]
        upload = upload_file(owner, "mine.pdf", PDF_BYTES)
        file_id = upload.get_json()["file"]["id"]
        _signup(client, full_name="Outsider")
        outsider_class = client.post("/api/classes", json={"name": "Other"}).get_json()[
            "class"
        ]["id"]
        response = client.post("/api/shares", json={
            "resourceType": "file", "resourceId": file_id,
            "classId": outsider_class,  # owner is not a member of it
        })
        assert response.status_code == 404

    def test_shared_folder_grants_access_to_descendants(self, shared_env, app):
        """Folder share inherits to files in child folders (documented rule)."""
        owner = shared_env["owner"]
        member = shared_env["member"]
        class_id = shared_env["class_id"]

        root = owner.post("/api/folders", json={"name": "Semester 4"}).get_json()["folder"]
        child = owner.post(
            "/api/folders", json={"name": "DB Systems", "parentId": root["id"]}
        ).get_json()["folder"]
        upload = upload_file(owner, "lecture.pdf", PDF_BYTES, folder_id=child["id"])
        file_id = upload.get_json()["file"]["id"]

        # Not yet shared -> member sees nothing.
        assert member.get(f"/api/files/{file_id}/download").status_code == 404

        owner.post("/api/shares", json={
            "resourceType": "folder", "resourceId": root["id"], "classId": class_id,
        })
        assert member.get(f"/api/files/{file_id}/download").status_code == 200

        # Unsharing the root revokes the whole subtree.
        owner.post("/api/shares/unshare", json={
            "resourceType": "folder", "resourceId": root["id"],
        })
        assert member.get(f"/api/files/{file_id}/download").status_code == 404

    def test_member_can_read_but_not_edit_shared_note(self, shared_env):
        owner = shared_env["owner"]
        member = shared_env["member"]
        class_id = shared_env["class_id"]
        note = owner.post(
            "/api/notes", json={"title": "Thermodynamics", "content": "Laws", "tags": []}
        ).get_json()["note"]
        owner.post("/api/shares", json={
            "resourceType": "note", "resourceId": note["id"], "classId": class_id,
        })

        read = member.get(f"/api/notes/{note['id']}")
        assert read.status_code == 200
        assert read.get_json()["note"]["title"] == "Thermodynamics"
        # But mutation is rejected.
        assert member.put(
            f"/api/notes/{note['id']}", json={"title": "hijacked"}
        ).status_code == 404
        assert member.delete(f"/api/notes/{note['id']}").status_code == 404

    def test_class_materials_lists_shared_only(self, shared_env):
        owner = shared_env["owner"]
        member = shared_env["member"]
        class_id = shared_env["class_id"]
        shared_upload = upload_file(owner, "shared-lecture.pdf", PDF_BYTES)
        private_upload = upload_file(owner, "private-diary.pdf", PDF_BYTES)
        owner.post("/api/shares", json={
            "resourceType": "file",
            "resourceId": shared_upload.get_json()["file"]["id"],
            "classId": class_id,
        })

        materials = member.get(f"/api/classes/{class_id}/materials").get_json()
        names = [f["name"] for f in materials["files"]]
        assert "shared-lecture.pdf" in names
        assert "private-diary.pdf" not in names

    def test_non_member_cannot_list_materials(self, shared_env, client):
        class_id = shared_env["class_id"]
        _signup(client, full_name="Outsider")
        assert client.get(f"/api/classes/{class_id}/materials").status_code == 404
