"""Study Library file tests: upload validation, CRUD, trash, ZIP, preview, stats."""

import io
import zipfile

from app import storage
from app.extensions import db
from app.models import StudyFile
from tests.conftest import (
    DOCX_BYTES,
    PDF_BYTES,
    PNG_BYTES,
    TXT_BYTES,
    register_user,
    upload_file,
)


class TestUpload:
    def test_upload_stores_bytes_and_metadata(self, client, app):
        register_user(client)
        response = upload_file(client, "Lecture Notes.pdf", PDF_BYTES)
        assert response.status_code == 201
        file_row = response.get_json()["file"]
        assert file_row["name"] == "Lecture Notes.pdf"
        assert file_row["extension"] == "pdf"
        assert file_row["mimeType"] == "application/pdf"
        assert file_row["sizeBytes"] == len(PDF_BYTES)
        assert file_row["folderId"] is None
        assert file_row["isTrashed"] is False
        # The on-disk name is server-internal and never exposed via the API.
        assert "storedName" not in file_row

        with app.app_context():
            row = db.session.get(StudyFile, file_row["id"])
            assert row.stored_name.endswith(".pdf")
            assert " " not in row.stored_name
            assert storage.file_path(row.stored_name).read_bytes() == PDF_BYTES

    def test_signature_must_match_extension(self, client):
        register_user(client)
        # A .pdf whose bytes are not a PDF.
        response = upload_file(client, "fake.pdf", b"hello, not a pdf")
        assert response.status_code == 422
        assert "does not look like" in response.get_json()["message"]

    def test_unsupported_extension_rejected(self, client):
        register_user(client)
        response = upload_file(client, "payload.exe", b"MZ\x90\x00")
        assert response.status_code == 422
        assert "Unsupported file type" in response.get_json()["message"]

    def test_binary_masquerading_as_txt_rejected(self, client):
        register_user(client)
        response = upload_file(client, "notes.txt", b"\x00\x01\x02binary")
        assert response.status_code == 422

    def test_empty_file_rejected(self, client):
        register_user(client)
        assert upload_file(client, "empty.pdf", b"").status_code == 422

    def test_path_traversal_name_is_neutralized(self, client, app):
        register_user(client)
        response = upload_file(client, "../../etc/passwd.txt", TXT_BYTES)
        assert response.status_code == 201
        file_row = response.get_json()["file"]
        assert "/" not in file_row["name"] and ".." not in file_row["name"]
        with app.app_context():
            row = db.session.get(StudyFile, file_row["id"])
            # Stored inside the configured upload root, nowhere else.
            assert storage.file_path(row.stored_name).parent == storage._upload_root()

    def test_upload_into_folder(self, client):
        register_user(client)
        folder_id = client.post("/api/folders", json={"name": "Semester 5"}).get_json()["folder"]["id"]
        response = upload_file(client, "slides.pdf", PDF_BYTES, folder_id=folder_id)
        assert response.status_code == 201
        assert response.get_json()["file"]["folderId"] == folder_id
        assert response.get_json()["file"]["folderName"] == "Semester 5"

    def test_invalid_folder_rejected(self, client):
        register_user(client)
        response = upload_file(client, "slides.pdf", PDF_BYTES, folder_id=999999)
        assert response.status_code == 422

    def test_duplicate_names_coexist(self, client, app):
        register_user(client)
        assert upload_file(client, "slides.pdf", PDF_BYTES).status_code == 201
        assert upload_file(client, "slides.pdf", PDF_BYTES).status_code == 201
        listing = client.get("/api/files").get_json()["files"]
        assert len(listing) == 2

    def test_oversize_upload_rejected(self, client, app):
        register_user(client)
        app.config["MAX_UPLOAD_MB"] = 0  # any byte exceeds the cap
        try:
            response = upload_file(client, "big.pdf", PDF_BYTES)
            assert response.status_code == 413
        finally:
            app.config["MAX_UPLOAD_MB"] = 25

    def test_upload_requires_auth(self, client):
        response = upload_file(client, "slides.pdf", PDF_BYTES)
        assert response.status_code == 401


class TestListSearchFilterSort:
    def seed(self, client):
        folder = client.post("/api/folders", json={"name": "Networks"}).get_json()["folder"]["id"]
        upload_file(client, "a-notes.pdf", PDF_BYTES, folder_id=folder)
        upload_file(client, "b-slides.png", PNG_BYTES)
        upload_file(client, "c-tutorial.txt", TXT_BYTES)
        return folder

    def test_search_by_name(self, client):
        register_user(client)
        self.seed(client)
        listing = client.get("/api/files?q=slides").get_json()
        assert [row["name"] for row in listing["files"]] == ["b-slides.png"]

    def test_filter_by_type_and_folder(self, client):
        register_user(client)
        folder = self.seed(client)
        assert len(client.get("/api/files?type=pdf").get_json()["files"]) == 1
        assert len(client.get(f"/api/files?folder={folder}").get_json()["files"]) == 1
        assert len(client.get("/api/files?folder=root").get_json()["files"]) == 2

    def test_sort_by_name_and_size(self, client):
        register_user(client)
        self.seed(client)
        names = [row["name"] for row in client.get("/api/files?sort=name").get_json()["files"]]
        assert names == sorted(names)
        sizes = [row["sizeBytes"] for row in client.get("/api/files?sort=size").get_json()["files"]]
        assert sizes == sorted(sizes, reverse=True)

    def test_pagination(self, client):
        register_user(client)
        for i in range(5):
            upload_file(client, f"doc-{i}.pdf", PDF_BYTES)
        page = client.get("/api/files?per_page=2&page=2").get_json()
        assert page["pagination"]["total"] == 5
        assert page["pagination"]["totalPages"] == 3
        assert len(page["files"]) == 2


class TestDownloadPreview:
    def test_download_returns_original_bytes_and_name(self, client):
        register_user(client)
        file_id = upload_file(client, "Lecture Notes.pdf", PDF_BYTES).get_json()["file"]["id"]
        response = client.get(f"/api/files/{file_id}/download")
        assert response.status_code == 200
        assert response.data == PDF_BYTES
        assert "Lecture" in response.headers["Content-Disposition"]

    def test_preview_pdf_inline(self, client):
        register_user(client)
        file_id = upload_file(client, "slides.pdf", PDF_BYTES).get_json()["file"]["id"]
        response = client.get(f"/api/files/{file_id}/preview")
        assert response.status_code == 200
        assert response.headers["Content-Type"].startswith("application/pdf")
        assert "attachment" not in response.headers.get("Content-Disposition", "")

    def test_office_preview_refused_with_415(self, client):
        register_user(client)
        file_id = upload_file(client, "report.docx", DOCX_BYTES).get_json()["file"]["id"]
        response = client.get(f"/api/files/{file_id}/preview")
        assert response.status_code == 415
        assert "download" in response.get_json()["message"].lower()

    def test_text_preview(self, client):
        register_user(client)
        file_id = upload_file(client, "tutorial.txt", TXT_BYTES).get_json()["file"]["id"]
        response = client.get(f"/api/files/{file_id}/preview/text")
        assert response.status_code == 200
        assert response.get_json()["content"] == TXT_BYTES.decode()

    def test_download_missing_file_is_clean_404(self, client, app):
        register_user(client)
        file_id = upload_file(client, "gone.pdf", PDF_BYTES).get_json()["file"]["id"]
        with app.app_context():
            row = db.session.get(StudyFile, file_id)
            storage.delete(row.stored_name)
        response = client.get(f"/api/files/{file_id}/download")
        assert response.status_code == 404


class TestUpdateMovePin:
    def test_rename_keeps_extension(self, client):
        register_user(client)
        file_id = upload_file(client, "draft.pdf", PDF_BYTES).get_json()["file"]["id"]
        response = client.put(f"/api/files/{file_id}", json={"name": "Final Report"})
        assert response.status_code == 200
        assert response.get_json()["file"]["name"] == "Final Report.pdf"

    def test_rename_cannot_change_type(self, client):
        register_user(client)
        file_id = upload_file(client, "draft.pdf", PDF_BYTES).get_json()["file"]["id"]
        response = client.put(f"/api/files/{file_id}", json={"name": "draft.docx"})
        assert response.status_code == 422

    def test_move_between_folders(self, client):
        register_user(client)
        source = client.post("/api/folders", json={"name": "Inbox"}).get_json()["folder"]["id"]
        target = client.post("/api/folders", json={"name": "Archive"}).get_json()["folder"]["id"]
        file_id = upload_file(client, "notes.pdf", PDF_BYTES, folder_id=source).get_json()["file"]["id"]

        response = client.put(f"/api/files/{file_id}", json={"folderId": target})
        assert response.status_code == 200
        assert response.get_json()["file"]["folderId"] == target

        # And back to the library root.
        response = client.put(f"/api/files/{file_id}", json={"folderId": None})
        assert response.get_json()["file"]["folderId"] is None

    def test_pin_toggle(self, client):
        register_user(client)
        file_id = upload_file(client, "notes.pdf", PDF_BYTES).get_json()["file"]["id"]
        response = client.put(f"/api/files/{file_id}", json={"isPinned": True})
        assert response.get_json()["file"]["isPinned"] is True
        assert len(client.get("/api/files?pinned=true").get_json()["files"]) == 1


class TestTrashWorkflow:
    def test_trash_restore_cycle(self, client):
        register_user(client)
        file_id = upload_file(client, "notes.pdf", PDF_BYTES).get_json()["file"]["id"]

        assert client.delete(f"/api/files/{file_id}").status_code == 204
        assert client.get("/api/files").get_json()["files"] == []
        trash = client.get("/api/files/trash").get_json()["files"]
        assert len(trash) == 1 and trash[0]["isTrashed"] is True

        # Trashed files cannot be downloaded until restored.
        assert client.get(f"/api/files/{file_id}/download").status_code == 409

        restored = client.patch(f"/api/files/{file_id}/restore")
        assert restored.status_code == 200
        assert len(client.get("/api/files").get_json()["files"]) == 1
        assert client.get(f"/api/files/{file_id}/download").status_code == 200

    def test_purge_removes_row_and_bytes(self, client, app):
        register_user(client)
        file_id = upload_file(client, "notes.pdf", PDF_BYTES).get_json()["file"]["id"]
        with app.app_context():
            stored_path = storage.file_path(db.session.get(StudyFile, file_id).stored_name)
            assert stored_path.exists()

        client.delete(f"/api/files/{file_id}")
        assert client.delete(f"/api/files/{file_id}/purge").status_code == 204
        assert not stored_path.exists()
        assert client.get(f"/api/files/{file_id}").status_code == 404

    def test_empty_trash(self, client):
        register_user(client)
        for i in range(3):
            file_id = upload_file(client, f"doc-{i}.pdf", PDF_BYTES).get_json()["file"]["id"]
            client.delete(f"/api/files/{file_id}")
        response = client.delete("/api/files/trash")
        assert response.get_json()["removed"] == 3
        assert client.get("/api/files/trash").get_json()["files"] == []


class TestZipDownload:
    def test_zip_preserves_folder_structure(self, client):
        register_user(client)
        folder = client.post("/api/folders", json={"name": "Semester 5"}).get_json()["folder"]["id"]
        a = upload_file(client, "notes.pdf", PDF_BYTES, folder_id=folder).get_json()["file"]["id"]
        b = upload_file(client, "diagram.png", PNG_BYTES).get_json()["file"]["id"]

        response = client.post("/api/files/zip", json={"fileIds": [a, b]})
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            names = archive.namelist()
            assert "Semester 5/notes.pdf" in names
            assert "diagram.png" in names
            assert archive.read("Semester 5/notes.pdf") == PDF_BYTES

    def test_zip_refuses_foreign_files(self, client):
        register_user(client)
        file_id = upload_file(client, "mine.pdf", PDF_BYTES).get_json()["file"]["id"]
        client.post("/api/auth/logout")
        register_user(client)
        response = client.post("/api/files/zip", json={"fileIds": [file_id]})
        assert response.status_code == 404

    def test_zip_requires_selection(self, client):
        register_user(client)
        assert client.post("/api/files/zip", json={"fileIds": []}).status_code == 422


class TestStats:
    def test_storage_stats_are_real(self, client):
        register_user(client)
        upload_file(client, "a.pdf", PDF_BYTES)
        trashed_id = upload_file(client, "b.pdf", PDF_BYTES).get_json()["file"]["id"]
        client.delete(f"/api/files/{trashed_id}")

        stats = client.get("/api/files/stats").get_json()
        assert stats["storage"]["usedBytes"] == len(PDF_BYTES)
        assert stats["storage"]["fileCount"] == 1
        assert stats["storage"]["trashedCount"] == 1
        assert len(stats["recentFiles"]) == 1
        assert stats["pinnedFiles"] == []


class TestOwnership:
    def test_other_users_files_invisible(self, client):
        register_user(client)
        file_id = upload_file(client, "secret.pdf", PDF_BYTES).get_json()["file"]["id"]
        client.post("/api/auth/logout")
        register_user(client)

        assert client.get("/api/files").get_json()["files"] == []
        assert client.get(f"/api/files/{file_id}").status_code == 404
        assert client.get(f"/api/files/{file_id}/download").status_code == 404
        assert client.put(f"/api/files/{file_id}", json={"name": "hacked"}).status_code == 404
        assert client.delete(f"/api/files/{file_id}").status_code == 404
        assert client.delete(f"/api/files/{file_id}/purge").status_code == 404
