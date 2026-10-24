"""Folder hierarchy tests: CRUD, depth/duplicate rules, breadcrumbs, safe deletion."""

from tests.conftest import PDF_BYTES, register_user, upload_file


def make_folder(client, name="Semester 5", parent_id=None):
    payload = {"name": name}
    if parent_id is not None:
        payload["parentId"] = parent_id
    return client.post("/api/folders", json=payload)


class TestFolderCrud:
    def test_create_root_and_nested(self, client):
        register_user(client)
        root = make_folder(client, "Semester 5")
        assert root.status_code == 201
        root_id = root.get_json()["folder"]["id"]

        child = make_folder(client, "Cyber Security", parent_id=root_id)
        assert child.status_code == 201
        body = child.get_json()["folder"]
        assert body["parentId"] == root_id
        assert body["name"] == "Cyber Security"

    def test_create_requires_name(self, client):
        register_user(client)
        response = client.post("/api/folders", json={"name": "   "})
        assert response.status_code == 422
        assert "name" in response.get_json()["message"].lower()

    def test_duplicate_sibling_name_rejected_case_insensitive(self, client):
        register_user(client)
        assert make_folder(client, "Cyber Security").status_code == 201
        duplicate = make_folder(client, "cyber security")
        assert duplicate.status_code == 409

    def test_same_name_in_different_parents_allowed(self, client):
        register_user(client)
        a = make_folder(client, "Lectures").get_json()["folder"]["id"]
        b = make_folder(client, "Practicals").get_json()["folder"]["id"]
        assert make_folder(client, "Week 1", parent_id=a).status_code == 201
        assert make_folder(client, "Week 1", parent_id=b).status_code == 201

    def test_rename(self, client):
        register_user(client)
        folder_id = make_folder(client, "Old Name").get_json()["folder"]["id"]
        response = client.put(f"/api/folders/{folder_id}", json={"name": "New Name"})
        assert response.status_code == 200
        assert response.get_json()["folder"]["name"] == "New Name"

    def test_list_includes_counts(self, client):
        register_user(client)
        parent = make_folder(client, "Semester 5").get_json()["folder"]["id"]
        make_folder(client, "Cyber Security", parent_id=parent)
        upload_file(client, "slides.pdf", PDF_BYTES, folder_id=parent)

        listing = client.get("/api/folders").get_json()["folders"]
        by_id = {folder["id"]: folder for folder in listing}
        assert by_id[parent]["fileCount"] == 1
        assert by_id[parent]["folderCount"] == 1

    def test_breadcrumbs_chain(self, client):
        register_user(client)
        year = make_folder(client, "Year 3").get_json()["folder"]["id"]
        sem = make_folder(client, "Semester 5", parent_id=year).get_json()["folder"]["id"]
        subj = make_folder(client, " Networks ", parent_id=sem).get_json()["folder"]["id"]

        response = client.get(f"/api/folders/{subj}/contents")
        assert response.status_code == 200
        crumbs = [crumb["name"] for crumb in response.get_json()["breadcrumbs"]]
        assert crumbs == ["Year 3", "Semester 5", "Networks"]

    def test_foreign_folder_is_404(self, client):
        register_user(client)
        folder_id = make_folder(client, "Private").get_json()["folder"]["id"]
        client.post("/api/auth/logout")
        register_user(client)
        assert client.get(f"/api/folders/{folder_id}").status_code == 404
        assert client.put(f"/api/folders/{folder_id}", json={"name": "X"}).status_code == 404
        assert client.delete(f"/api/folders/{folder_id}").status_code == 404


class TestFolderMove:
    def test_move_folder_into_sibling(self, client):
        register_user(client)
        a = make_folder(client, "Lectures").get_json()["folder"]["id"]
        b = make_folder(client, "Practicals").get_json()["folder"]["id"]
        week = make_folder(client, "Week 1", parent_id=a).get_json()["folder"]["id"]

        response = client.put(f"/api/folders/{week}", json={"parentId": b})
        assert response.status_code == 200
        assert response.get_json()["folder"]["parentId"] == b

    def test_cannot_move_into_itself_or_descendant(self, client):
        register_user(client)
        parent = make_folder(client, "Parent").get_json()["folder"]["id"]
        child = make_folder(client, "Child", parent_id=parent).get_json()["folder"]["id"]
        grandchild = make_folder(client, "Grandchild", parent_id=child).get_json()["folder"]["id"]

        assert client.put(f"/api/folders/{parent}", json={"parentId": parent}).status_code == 422
        response = client.put(f"/api/folders/{parent}", json={"parentId": grandchild})
        assert response.status_code == 422

    def test_depth_limit(self, client):
        register_user(client)
        chain = [make_folder(client, "Level 0").get_json()["folder"]["id"]]
        for i in range(1, 6):
            chain.append(
                make_folder(client, f"Level {i}", parent_id=chain[-1]).get_json()["folder"]["id"]
            )
        # Level 6 exists; one more level must be rejected (max depth 6).
        response = make_folder(client, "Too deep", parent_id=chain[-1])
        assert response.status_code == 422

    def test_move_to_root(self, client):
        register_user(client)
        parent = make_folder(client, "Parent").get_json()["folder"]["id"]
        child = make_folder(client, "Child", parent_id=parent).get_json()["folder"]["id"]
        response = client.put(f"/api/folders/{child}", json={"parentId": None})
        assert response.status_code == 200
        assert response.get_json()["folder"]["parentId"] is None


class TestSafeDeletion:
    def test_delete_empty_folder(self, client):
        register_user(client)
        folder_id = make_folder(client, "Scratch").get_json()["folder"]["id"]
        assert client.delete(f"/api/folders/{folder_id}").status_code in {200, 204}
        assert client.get(f"/api/folders/{folder_id}").status_code == 404

    def test_non_empty_folder_requires_confirmation(self, client):
        register_user(client)
        folder = make_folder(client, "Semester 5").get_json()["folder"]["id"]
        sub = make_folder(client, "Cyber Security", parent_id=folder).get_json()["folder"]["id"]
        upload_file(client, "notes.pdf", PDF_BYTES, folder_id=sub)

        response = client.delete(f"/api/folders/{folder}")
        assert response.status_code == 409
        body = response.get_json()
        assert body["details"]["fileCount"] == 1
        assert body["details"]["subfolderCount"] == 1
        # Nothing was deleted by the unconfirmed attempt.
        assert client.get(f"/api/folders/{folder}").status_code == 200

    def test_recursive_delete_trashes_files_never_destroys(self, client):
        register_user(client)
        folder = make_folder(client, "Semester 5").get_json()["folder"]["id"]
        sub = make_folder(client, "Cyber Security", parent_id=folder).get_json()["folder"]["id"]
        upload_file(client, "notes.pdf", PDF_BYTES, folder_id=sub)

        response = client.delete(f"/api/folders/{folder}?recursive=true")
        assert response.status_code == 200
        result = response.get_json()
        assert result["trashedFiles"] == 1
        assert result["removedFolders"] == 2
        assert client.get(f"/api/folders/{folder}").status_code == 404

        # The file survives in the Trash and can be restored.
        trash = client.get("/api/files/trash").get_json()["files"]
        assert [file_row["name"] for file_row in trash] == ["notes.pdf"]
        restore = client.patch(f"/api/files/{trash[0]['id']}/restore")
        assert restore.status_code == 200
        assert restore.get_json()["file"]["folderId"] is None  # folder is gone
