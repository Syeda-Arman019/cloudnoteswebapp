"""Notes↔folders association and file upload-date filter tests."""

from datetime import timedelta

from app.extensions import db
from app.models import StudyFile, utcnow
from tests.conftest import PDF_BYTES, create_note, register_user, upload_file


def make_folder(client, name="Semester 5"):
    return client.post("/api/folders", json={"name": name}).get_json()["folder"]["id"]


class TestNoteFolderAssociation:
    def test_create_note_in_folder(self, client):
        register_user(client)
        folder_id = make_folder(client)
        response = create_note(client, title="Networks cheatsheet", folderId=folder_id)
        assert response.status_code == 201
        note = response.get_json()["note"]
        assert note["folderId"] == folder_id
        assert note["folder"]["name"] == "Semester 5"

    def test_move_note_between_folders_and_out(self, client):
        register_user(client)
        a = make_folder(client, "Semester 5")
        b = make_folder(client, "Semester 6")
        note_id = create_note(client, folderId=a).get_json()["note"]["id"]

        response = client.put(f"/api/notes/{note_id}", json={"folderId": b})
        assert response.status_code == 200
        assert response.get_json()["note"]["folderId"] == b

        response = client.put(f"/api/notes/{note_id}", json={"folderId": None})
        assert response.get_json()["note"]["folderId"] is None

    def test_foreign_folder_rejected(self, client):
        register_user(client)
        folder_id = make_folder(client)
        client.post("/api/auth/logout")
        register_user(client)
        response = create_note(client, folderId=folder_id)
        assert response.status_code == 422

    def test_filter_notes_by_folder(self, client):
        register_user(client)
        folder_id = make_folder(client)
        create_note(client, title="In folder", folderId=folder_id)
        create_note(client, title="No folder")

        listing = client.get(f"/api/notes?folder={folder_id}").get_json()
        assert [note["title"] for note in listing["notes"]] == ["In folder"]
        listing = client.get("/api/notes?folder=none").get_json()
        assert [note["title"] for note in listing["notes"]] == ["No folder"]

    def test_deleting_folder_keeps_note(self, client):
        register_user(client)
        folder_id = make_folder(client)
        note_id = create_note(client, title="Survivor", folderId=folder_id).get_json()["note"]["id"]
        client.delete(f"/api/folders/{folder_id}")
        response = client.get(f"/api/notes/{note_id}")
        assert response.status_code == 200
        assert response.get_json()["note"]["folderId"] is None


class TestUploadedDateFilter:
    def _backdate(self, app, file_id, days_ago):
        with app.app_context():
            row = db.session.get(StudyFile, file_id)
            row.created_at = utcnow() - timedelta(days=days_ago)
            db.session.commit()

    def test_uploaded_filters(self, client, app):
        register_user(client)
        recent = upload_file(client, "recent.pdf", PDF_BYTES).get_json()["file"]["id"]
        old = upload_file(client, "old.pdf", PDF_BYTES).get_json()["file"]["id"]
        self._backdate(app, old, 10)

        week = client.get("/api/files?uploaded=week").get_json()["files"]
        assert [row["id"] for row in week] == [recent]
        month = client.get("/api/files?uploaded=month").get_json()["files"]
        assert len(month) == 2
        assert len(client.get("/api/files?uploaded=any").get_json()["files"]) == 2
        assert client.get("/api/files?uploaded=weird").status_code == 400
