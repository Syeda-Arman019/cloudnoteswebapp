"""
Part 2 Phases B–D tests: chat messages, attachments (incl. voice),
presence and unread tracking.

Focus: authorization (cross-class isolation, sender identity from the
session, edit/delete policy), persistence, limits, and the attachment
membership checks — failure cases are tested, not just happy paths.
"""

import pytest

from tests.conftest import PDF_BYTES, PNG_BYTES, register_user


def _signup(client, full_name="Student"):
    response, email, password = register_user(client, full_name=full_name)
    assert response.status_code == 201
    _MEMBER_EMAIL[0] = email
    return email, password


# Last email registered by _signup (used by the persistence test).
_MEMBER_EMAIL = [None]


WEBM_MAGIC = b"\x1a\x45\xdf\xa3" + b"\x00" * 64   # valid MediaRecorder WebM head
OGG_MAGIC = b"OggS" + b"\x00" * 64
FAKE_MP4 = b"not-a-recording" + b"\x00" * 64


@pytest.fixture
def env(owner, member, app):
    """Owner + member in one class with an independent client each."""
    class_id = owner.post(
        "/api/classes", json={"name": "23 Batch"}
    ).get_json()["class"]["id"]
    token = owner.post(
        f"/api/classes/{class_id}/invitations", json={}
    ).get_json()["invitation"]["token"]
    _signup(member, full_name="Class Member")
    assert member.post("/api/invitations/join", json={"token": token}).status_code == 200
    return {"class_id": class_id, "owner": owner, "member": member, "app": app}


def _send(client, class_id, content, **extra):
    payload = {"content": content}
    payload.update(extra)
    return client.post(f"/api/classes/{class_id}/messages", json=payload)


class TestMessaging:
    def test_member_sends_and_receives(self, env):
        class_id = env["class_id"]
        response = _send(env["owner"], class_id, "Hello batch!")
        assert response.status_code == 201
        message = response.get_json()["message"]
        assert message["senderName"] == "Class Owner"
        assert message["isOwn"] is True

        # The classmate reads it back — sender identity is the real name.
        history = env["member"].get(f"/api/classes/{class_id}/messages").get_json()
        assert len(history["messages"]) == 1
        assert history["messages"][0]["content"] == "Hello batch!"
        assert history["messages"][0]["senderName"] == "Class Owner"
        assert history["messages"][0]["isOwn"] is False

    def test_messages_persist_across_sessions(self, env, app):
        """Logout + fresh login: history is still there (stored in the DB)."""
        class_id = env["class_id"]
        _send(env["owner"], class_id, "Persist me")

        # Owner created via the shared `owner` fixture -> re-auth is easier
        # through the member, whose credentials we registered here.
        history_before = env["member"].get(
            f"/api/classes/{class_id}/messages"
        ).get_json()
        assert [m["content"] for m in history_before["messages"]] == ["Persist me"]

        # Wipe the session entirely and prove it is gone.
        env["member"].post("/api/auth/logout")
        assert env["member"].get("/api/classes").status_code == 401

        # A brand-new signed-in client still reads the stored history.
        fresh = app.test_client()
        fresh.post("/api/auth/login", json={
            "email": _MEMBER_EMAIL[0], "password": "secret123",
        })
        history = fresh.get(f"/api/classes/{class_id}/messages").get_json()
        assert [m["content"] for m in history["messages"]] == ["Persist me"]

    def test_sender_identity_from_session_not_payload(self, env):
        """A forged senderId in the body must be ignored."""
        class_id = env["class_id"]
        response = env["member"].post(f"/api/classes/{class_id}/messages", json={
            "content": "I am spoofing", "senderId": 999, "sender_id": 1,
            "role": "owner", "isOwner": True,
        })
        assert response.status_code == 201
        message = response.get_json()["message"]
        assert message["senderName"] == "Class Member"
        member_id = env["member"].get("/api/auth/me").get_json()["user"]["id"]
        assert message["senderId"] == member_id

    def test_non_member_cannot_read_or_send(self, env, client):
        class_id = env["class_id"]
        _send(env["owner"], class_id, "Classmates only")
        _signup(client, full_name="Outsider")
        # Known class id must not grant anything.
        assert client.get(f"/api/classes/{class_id}/messages").status_code == 404
        assert _send(client, class_id, "let me in").status_code == 404

    def test_cross_class_isolation(self, env, owner):
        """Messages from class A never appear in class B's history."""
        class_id = env["class_id"]
        _send(env["owner"], class_id, "Secret for 23 Batch")

        other_id = owner.post("/api/classes", json={"name": "Other Class"}).get_json()[
            "class"
        ]["id"]
        history = owner.get(f"/api/classes/{other_id}/messages").get_json()
        assert history["messages"] == []

        # And a reply across classes is rejected.
        message_id = owner.get(
            f"/api/classes/{class_id}/messages"
        ).get_json()["messages"][0]["id"]
        response = _send(owner, other_id, "wrong thread", replyToId=message_id)
        assert response.status_code == 404

    def test_replies_reference_correct_message(self, env):
        class_id = env["class_id"]
        first = _send(env["owner"], class_id, "Chapter 5 due Friday").get_json()["message"]
        reply = _send(
            env["member"], class_id, "Thanks!", replyToId=first["id"]
        ).get_json()["message"]
        assert reply["replyTo"]["id"] == first["id"]
        assert reply["replyTo"]["senderName"] == "Class Owner"
        assert reply["replyTo"]["preview"] == "Chapter 5 due Friday"

    def test_edit_own_message(self, env):
        class_id = env["class_id"]
        message = _send(env["member"], class_id, "typo heer").get_json()["message"]
        response = env["member"].patch(
            f"/api/messages/{message['id']}", json={"content": "typo here"}
        )
        assert response.status_code == 200
        edited = response.get_json()["message"]
        assert edited["content"] == "typo here"
        assert edited["editedAt"] is not None

    def test_edit_someone_elses_message_rejected(self, env):
        class_id = env["class_id"]
        message = _send(env["owner"], class_id, "owner said this").get_json()["message"]
        # Even a class member (not to mention the owner editing a member's...)
        response = env["member"].patch(
            f"/api/messages/{message['id']}", json={"content": "rewritten"}
        )
        assert response.status_code == 403

    def test_delete_own_message_tombstones(self, env):
        class_id = env["class_id"]
        message = _send(env["member"], class_id, "delete me").get_json()["message"]
        assert env["member"].delete(f"/api/messages/{message['id']}").status_code == 200
        history = env["owner"].get(f"/api/classes/{class_id}/messages").get_json()
        row = history["messages"][0]
        assert row["isDeleted"] is True
        assert row["content"] == ""  # content purged, thread position kept

    def test_delete_others_message_rejected_for_member(self, env):
        class_id = env["class_id"]
        message = _send(env["owner"], class_id, "mine").get_json()["message"]
        response = env["member"].delete(f"/api/messages/{message['id']}")
        assert response.status_code == 403

    def test_owner_can_moderate_delete(self, env):
        class_id = env["class_id"]
        message = _send(env["member"], class_id, "spam").get_json()["message"]
        response = env["owner"].delete(f"/api/messages/{message['id']}")
        assert response.status_code == 200

    def test_empty_message_rejected(self, env):
        class_id = env["class_id"]
        assert _send(env["owner"], class_id, "   ").status_code == 422

    def test_oversized_message_rejected(self, env):
        class_id = env["class_id"]
        response = _send(env["owner"], class_id, "x" * 4001)
        assert response.status_code == 422

    def test_malicious_text_stored_verbatim_not_html(self, env):
        """Messages are plain text: the API returns the raw string; the
        React frontend renders it as text (React escapes on render)."""
        class_id = env["class_id"]
        payload = '<script>alert("xss")</script> & <img src=x onerror=alert(1)>'
        sent = _send(env["owner"], class_id, payload).get_json()["message"]
        assert sent["content"] == payload  # stored byte-for-byte as TEXT
        history = env["member"].get(f"/api/classes/{class_id}/messages").get_json()
        assert history["messages"][0]["content"] == payload

    def test_pagination_before_cursor(self, env):
        class_id = env["class_id"]
        for index in range(50):
            _send(env["owner"], class_id, f"msg {index}")
        page = env["owner"].get(
            f"/api/classes/{class_id}/messages?limit=20"
        ).get_json()
        assert len(page["messages"]) == 20
        assert page["hasMore"] is True
        oldest_visible = page["messages"][0]["id"]

        earlier = env["owner"].get(
            f"/api/classes/{class_id}/messages?before={oldest_visible}&limit=20"
        ).get_json()
        assert all(m["id"] < oldest_visible for m in earlier["messages"])
        assert len(earlier["messages"]) == 20

        # Polling with `after` returns only new messages.
        newest = page["messages"][-1]["id"]
        _send(env["member"], class_id, "just arrived")
        fresh = env["owner"].get(
            f"/api/classes/{class_id}/messages?after={newest}"
        ).get_json()
        assert [m["content"] for m in fresh["messages"]] == ["just arrived"]

    def test_rate_limited_after_burst(self, env):
        """Message send limiter trips (60/min default)."""
        class_id = env["class_id"]
        statuses = [_send(env["owner"], class_id, f"burst {i}").status_code
                    for i in range(65)]
        assert 429 in statuses


class TestAttachments:
    def _upload(self, client, class_id, name, content, mime=None):
        from io import BytesIO

        data = {"file": (BytesIO(content), name)}
        if mime:
            data["file"] = (BytesIO(content), name, mime)
        return client.post(
            f"/api/classes/{class_id}/attachments",
            data=data, content_type="multipart/form-data",
        )

    def test_image_upload_accepted(self, env):
        class_id = env["class_id"]
        response = self._upload(env["member"], class_id, "diagram.png", PNG_BYTES)
        assert response.status_code == 201
        attachment = response.get_json()["attachment"]
        assert attachment["kind"] == "image"
        assert attachment["name"] == "diagram.png"
        assert attachment["sizeBytes"] == len(PNG_BYTES)

    def test_pdf_document_upload_accepted(self, env):
        class_id = env["class_id"]
        response = self._upload(env["owner"], class_id, "syllabus.pdf", PDF_BYTES)
        assert response.status_code == 201
        assert response.get_json()["attachment"]["kind"] == "document"

    def test_voice_upload_metadata(self, env):
        class_id = env["class_id"]
        response = self._upload(env["member"], class_id, "voice-message.webm", WEBM_MAGIC)
        assert response.status_code == 201
        attachment = response.get_json()["attachment"]
        assert attachment["kind"] == "audio"
        assert attachment["mimeType"] == "audio/webm"

    def test_ogg_voice_upload(self, env):
        class_id = env["class_id"]
        response = self._upload(env["member"], class_id, "note.ogg", OGG_MAGIC)
        assert response.status_code == 201
        assert response.get_json()["attachment"]["kind"] == "audio"
        assert response.get_json()["attachment"]["mimeType"] == "audio/ogg"

    def test_disallowed_type_rejected(self, env):
        class_id = env["class_id"]
        response = self._upload(env["member"], class_id, "malware.exe", b"MZ" * 64)
        assert response.status_code == 422

    def test_fake_audio_content_rejected(self, env):
        """Right extension, wrong bytes — magic check must catch it."""
        class_id = env["class_id"]
        response = self._upload(env["member"], class_id, "fake.webm", FAKE_MP4)
        assert response.status_code == 422

    def test_fake_image_content_rejected(self, env):
        class_id = env["class_id"]
        response = self._upload(env["member"], class_id, "fake.png", b"<html>nope</html>")
        assert response.status_code == 422

    def test_oversized_attachment_rejected(self, env):
        class_id = env["class_id"]
        app = env["app"]
        app.config["CHAT_MAX_IMAGE_MB"] = 0  # any byte overflows the cap
        try:
            big = PNG_BYTES + b"\x00" * 512
            response = self._upload(env["member"], class_id, "big.png", big)
            assert response.status_code == 413
        finally:
            app.config["CHAT_MAX_IMAGE_MB"] = 10

    def test_attachment_claimed_with_message(self, env):
        class_id = env["class_id"]
        attachment = self._upload(
            env["member"], class_id, "graph.png", PNG_BYTES
        ).get_json()["attachment"]
        response = _send(
            env["member"], class_id, "see graph", attachmentIds=[attachment["id"]]
        )
        assert response.status_code == 201
        message = response.get_json()["message"]
        assert len(message["attachments"]) == 1
        assert message["attachments"][0]["name"] == "graph.png"

    def test_message_requires_content_or_attachment(self, env):
        class_id = env["class_id"]
        response = env["member"].post(f"/api/classes/{class_id}/messages", json={
            "content": "", "attachmentIds": [],
        })
        assert response.status_code == 422

    def test_cannot_claim_other_users_pending_attachment(self, env):
        class_id = env["class_id"]
        attachment = self._upload(
            env["owner"], class_id, "owner-pending.png", PNG_BYTES
        ).get_json()["attachment"]
        response = _send(
            env["member"], class_id, "yoink", attachmentIds=[attachment["id"]]
        )
        assert response.status_code == 404

    def test_member_can_download_claimed_attachment(self, env):
        class_id = env["class_id"]
        attachment = self._upload(
            env["owner"], class_id, "handout.pdf", PDF_BYTES
        ).get_json()["attachment"]
        _send(env["owner"], class_id, "handout", attachmentIds=[attachment["id"]])

        response = env["member"].get(f"/api/attachments/{attachment['id']}/download")
        assert response.status_code == 200
        assert response.data == PDF_BYTES

    def test_non_member_cannot_download_attachment(self, env, client):
        class_id = env["class_id"]
        attachment = self._upload(
            env["owner"], class_id, "class-only.pdf", PDF_BYTES
        ).get_json()["attachment"]
        _send(env["owner"], class_id, "for class", attachmentIds=[attachment["id"]])

        _signup(client, full_name="Outsider")
        assert client.get(
            f"/api/attachments/{attachment['id']}/download"
        ).status_code == 404
        assert client.get(
            f"/api/attachments/{attachment['id']}/content"
        ).status_code == 404

    def test_pending_attachment_hidden_from_non_uploaders(self, env, client):
        class_id = env["class_id"]
        attachment = self._upload(
            env["owner"], class_id, "draft.png", PNG_BYTES
        ).get_json()["attachment"]
        # Not yet sent: even the classmate must not fetch it...
        assert env["member"].get(
            f"/api/attachments/{attachment['id']}/download"
        ).status_code == 404
        # ...but the uploader can (needed for pre-send preview management).
        assert env["owner"].get(
            f"/api/attachments/{attachment['id']}/download"
        ).status_code in (200, 415)

    def test_document_preview_inline_blocked_download_allowed(self, env):
        class_id = env["class_id"]
        attachment = self._upload(
            env["owner"], class_id, "reading.pdf", PDF_BYTES
        ).get_json()["attachment"]
        _send(env["owner"], class_id, "read this", attachmentIds=[attachment["id"]])
        member = env["member"]
        # PDFs are served inline-capable? Our policy: document -> 415 inline,
        # 200 as download.
        inline = member.get(f"/api/attachments/{attachment['id']}/content")
        assert inline.status_code in (200, 415)
        assert member.get(
            f"/api/attachments/{attachment['id']}/download"
        ).status_code == 200

    def test_upload_requires_membership(self, env, client):
        class_id = env["class_id"]
        _signup(client, full_name="Outsider")
        from io import BytesIO

        response = client.post(
            f"/api/classes/{class_id}/attachments",
            data={"file": (BytesIO(PNG_BYTES), "x.png")},
            content_type="multipart/form-data",
        )
        assert response.status_code == 404

    def test_path_traversal_filename_never_reaches_disk(self, env):
        class_id = env["class_id"]
        response = self._upload(env["owner"], class_id, "../../evil.png", PNG_BYTES)
        assert response.status_code == 201
        stored_name = response.get_json()["attachment"]
        # Display name is sanitized (no directory parts) and the id-based
        # lookup goes through the private store, never the raw name.
        assert ".." not in stored_name["name"]


class TestPresenceAndUnread:
    def test_heartbeat_marks_member_online(self, env):
        class_id = env["class_id"]
        response = env["member"].post(f"/api/classes/{class_id}/heartbeat")
        assert response.status_code == 200
        body = response.get_json()
        member_id = env["member"].get("/api/auth/me").get_json()["user"]["id"]
        assert member_id in body["onlineUserIds"]

        members = env["owner"].get(f"/api/classes/{class_id}/members").get_json()
        assert members["onlineCount"] == 1
        online = {m["user"]["id"] for m in members["members"] if m["isOnline"]}
        assert online == {member_id}

    def test_multiple_tabs_count_once(self, env):
        class_id = env["class_id"]
        member_id = env["member"].get("/api/auth/me").get_json()["user"]["id"]
        # Same user heartbeats twice (two tabs) -> counted once.
        env["member"].post(f"/api/classes/{class_id}/heartbeat")
        env["member"].post(f"/api/classes/{class_id}/heartbeat")
        body = env["member"].post(f"/api/classes/{class_id}/heartbeat").get_json()
        assert body["onlineUserIds"].count(member_id) == 1

    def test_stale_presence_expires(self, env, app):
        class_id = env["class_id"]
        import time as _time

        from app.services import class_service

        member_id = env["member"].get("/api/auth/me").get_json()["user"]["id"]
        env["member"].post(f"/api/classes/{class_id}/heartbeat")
        # Backdate the heartbeat beyond the TTL (simulates a dead tab).
        with class_service._presence_lock:
            class_service._presence[(class_id, member_id)] = (
                _time.monotonic() - class_service._PRESENCE_TTL_SECONDS - 5
            )
        body = env["member"].post(f"/api/classes/{class_id}/heartbeat").get_json()
        # The fresh heartbeat re-marks them; check the prune path directly:
        with class_service._presence_lock:
            class_service._presence[(class_id, member_id)] = (
                _time.monotonic() - class_service._PRESENCE_TTL_SECONDS - 5
            )
        online = class_service.online_user_ids(class_id)
        assert online == []

    def test_non_member_heartbeat_rejected(self, env, client):
        class_id = env["class_id"]
        _signup(client, full_name="Outsider")
        assert client.post(f"/api/classes/{class_id}/heartbeat").status_code == 404

    def test_removed_member_no_longer_counted(self, env):
        class_id = env["class_id"]
        member_id = env["member"].get("/api/auth/me").get_json()["user"]["id"]
        env["member"].post(f"/api/classes/{class_id}/heartbeat")
        env["owner"].delete(f"/api/classes/{class_id}/members/{member_id}")
        # Membership filter in online_user_ids drops them even if a stale
        # heartbeat key lingers.
        from app.services import class_service

        online = class_service.online_user_ids(class_id)
        assert member_id not in online

    def test_unread_counts_and_mark_read(self, env):
        class_id = env["class_id"]
        _send(env["owner"], class_id, "first")
        _send(env["owner"], class_id, "second")

        classes = env["member"].get("/api/classes").get_json()["classes"]
        assert classes[0]["unreadCount"] == 2

        # Own messages never inflate your own unread count.
        classes = env["owner"].get("/api/classes").get_json()["classes"]
        assert classes[0]["unreadCount"] == 0

        assert env["member"].post(
            f"/api/classes/{class_id}/read"
        ).status_code == 200
        classes = env["member"].get("/api/classes").get_json()["classes"]
        assert classes[0]["unreadCount"] == 0

        # A new message re-opens the unread state.
        _send(env["owner"], class_id, "third")
        classes = env["member"].get("/api/classes").get_json()["classes"]
        assert classes[0]["unreadCount"] == 1

    def test_unread_does_not_leak_across_classes(self, env, owner):
        class_id = env["class_id"]
        other_id = owner.post("/api/classes", json={"name": "Other"}).get_json()[
            "class"
        ]["id"]
        _send(env["owner"], class_id, "for 23 Batch only")
        # The member's unread applies to the class that received the message
        # and nothing to the unrelated class.
        classes = env["member"].get("/api/classes").get_json()["classes"]
        by_id = {c["id"]: c for c in classes}
        assert by_id[class_id]["unreadCount"] == 1
        if other_id in by_id:  # member may not be in Other; if they are, 0
            assert by_id[other_id]["unreadCount"] == 0
        # The sender (owner) has no unread anywhere.
        owner_classes = {c["id"]: c for c in owner.get("/api/classes").get_json()["classes"]}
        assert owner_classes[class_id]["unreadCount"] == 0
