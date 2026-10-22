"""Notes API: CRUD, pinning, search, filters, sorting, pagination, isolation."""

from tests.conftest import create_note, register_user


def _auth_second_user(client):
    """Second account for isolation checks (unique email)."""
    return register_user(client)


def test_create_and_fetch_note(client):
    register_user(client)
    response = create_note(
        client,
        title="My first note",
        content="# Heading\n\nBody text",
        tags=["alpha", "Beta", "alpha"],
    )
    assert response.status_code == 201
    note = response.get_json()["note"]
    assert note["title"] == "My first note"
    assert note["isPinned"] is False
    assert note["tags"] == ["Beta", "alpha"]  # de-duplicated; sorted by name
    assert note["createdAt"].endswith("Z")
    assert note["category"] is None

    fetched = client.get(f"/api/notes/{note['id']}")
    assert fetched.status_code == 200
    assert fetched.get_json()["note"]["content"] == "# Heading\n\nBody text"


def test_note_validation_errors(client):
    register_user(client)
    assert create_note(client, title="", content="x").status_code == 422
    assert create_note(client, title="ok", content="   ").status_code == 422
    assert create_note(client, title="x" * 121, content="ok").status_code == 422
    assert create_note(client, title="ok", content="c" * 40001).status_code == 422
    assert (
        create_note(client, title="ok", content="ok", categoryId=99999).status_code == 422
    )
    assert (
        create_note(client, title="ok", content="ok", categoryId="not-a-number").status_code
        == 422
    )
    assert create_note(client, title="ok", content="ok", tags=[["nested"]]).status_code == 422


def test_update_note(client):
    register_user(client)
    note = create_note(client, title="Original").get_json()["note"]

    response = client.put(
        f"/api/notes/{note['id']}",
        json={"title": "Updated", "content": "New body", "tags": ["edited"], "isPinned": True},
    )
    assert response.status_code == 200
    updated = response.get_json()["note"]
    assert updated["title"] == "Updated"
    assert updated["content"] == "New body"
    assert updated["tags"] == ["edited"]
    assert updated["isPinned"] is True
    assert updated["updatedAt"] >= updated["createdAt"]


def test_pin_and_unpin(client):
    register_user(client)
    note = create_note(client).get_json()["note"]

    pinned = client.patch(f"/api/notes/{note['id']}/pin", json={"isPinned": True})
    assert pinned.status_code == 200
    assert pinned.get_json()["note"]["isPinned"] is True

    unpinned = client.patch(f"/api/notes/{note['id']}/pin", json={"isPinned": False})
    assert unpinned.get_json()["note"]["isPinned"] is False


def test_delete_note(client):
    register_user(client)
    note = create_note(client).get_json()["note"]

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.get(f"/api/notes/{note['id']}").status_code == 404
    listing = client.get("/api/notes").get_json()
    assert listing["notes"] == []


def test_search_by_title_and_content(client):
    register_user(client)
    create_note(client, title="Django shortcuts", content="unrelated body")
    create_note(client, title="Groceries", content="buy eggs and milk")
    create_note(client, title="Other", content="mentions Django in the body")

    result = client.get("/api/notes?q=django").get_json()
    titles = {n["title"] for n in result["notes"]}
    assert titles == {"Django shortcuts", "Other"}

    result = client.get("/api/notes?q=milk").get_json()
    assert [n["title"] for n in result["notes"]] == ["Groceries"]


def test_filter_by_category_pinned_and_tag(client):
    register_user(client)
    categories = client.get("/api/categories").get_json()["categories"]
    work = next(c for c in categories if c["name"] == "Work")

    create_note(client, title="Work note", categoryId=work["id"], tags=["urgent"])
    create_note(client, title="Loose note")
    loose = create_note(client, title="Pinned loose", isPinned=True).get_json()["note"]
    client.patch(f"/api/notes/{loose['id']}/pin", json={"isPinned": True})

    by_category = client.get(f"/api/notes?category={work['id']}").get_json()
    assert [n["title"] for n in by_category["notes"]] == ["Work note"]

    uncategorized = client.get("/api/notes?category=uncategorized").get_json()
    assert {n["title"] for n in uncategorized["notes"]} == {"Loose note", "Pinned loose"}

    pinned = client.get("/api/notes?pinned=true").get_json()
    assert [n["title"] for n in pinned["notes"]] == ["Pinned loose"]

    by_tag = client.get("/api/notes?tag=urgent").get_json()
    assert [n["title"] for n in by_tag["notes"]] == ["Work note"]

    assert client.get("/api/notes?category=banana").status_code == 400
    assert client.get("/api/notes?pinned=maybe").status_code == 400
    assert client.get("/api/notes?sort=sideways").status_code == 400


def test_sorting_and_pagination(client):
    register_user(client)
    for index in range(7):
        create_note(client, title=f"Note {index}", content="x")

    newest = client.get("/api/notes?sort=newest&per_page=3").get_json()
    assert len(newest["notes"]) == 3
    assert newest["pagination"] == {"page": 1, "perPage": 3, "total": 7, "totalPages": 3}
    assert newest["notes"][0]["title"] == "Note 6"

    oldest = client.get("/api/notes?sort=oldest&per_page=3&page=3").get_json()
    assert [n["title"] for n in oldest["notes"]] == ["Note 6"]
    assert oldest["pagination"]["page"] == 3

    updated = client.get("/api/notes?sort=updated&per_page=3").get_json()
    assert updated["notes"][0]["title"] == "Note 6"


def test_per_page_is_capped(client):
    register_user(client)
    create_note(client)
    result = client.get("/api/notes?per_page=99999").get_json()
    assert result["pagination"]["perPage"] <= 100


def test_user_data_isolation(client):
    """User B cannot read, modify, or delete user A's notes."""
    _, email_a, _ = register_user(client)
    note_a = create_note(client, title="Private of A").get_json()["note"]

    client.post("/api/auth/logout")
    register_user(client)  # user B

    assert client.get(f"/api/notes/{note_a['id']}").status_code == 404
    assert (
        client.put(f"/api/notes/{note_a['id']}", json={"title": "hacked", "content": "x"}).status_code
        == 404
    )
    assert client.delete(f"/api/notes/{note_a['id']}").status_code == 404
    assert (
        client.patch(f"/api/notes/{note_a['id']}/pin", json={"isPinned": True}).status_code
        == 404
    )

    listing = client.get("/api/notes").get_json()
    assert listing["notes"] == []
    assert all(n["title"] != "Private of A" for n in listing["notes"])
    assert email_a != "nobody"


def test_notes_require_authentication(client):
    assert client.get("/api/notes").status_code == 401
    assert create_note(client).status_code == 401


def test_dashboard_uses_real_data(client):
    register_user(client)
    create_note(client, title="First")
    second = create_note(client, title="Second", categoryId=None).get_json()["note"]
    client.patch(f"/api/notes/{second['id']}/pin", json={"isPinned": True})

    stats = client.get("/api/dashboard").get_json()
    assert stats["stats"]["total"] == 2
    assert stats["stats"]["pinned"] == 1
    assert stats["stats"]["categories"] == 5  # seeded defaults
    assert stats["stats"]["updatedThisWeek"] >= 1
    assert len(stats["recentNotes"]) == 2
    assert stats["recentNotes"][0]["title"] == "Second"  # most recently updated first
    # No hard-coded statistics: values come from this account's rows only.
    assert stats["stats"]["uncategorized"] == 2  # neither note picked a category


def test_database_error_returns_clean_json(client, monkeypatch):
    """Unexpected DB failures surface as a controlled 500, not a traceback."""
    from sqlalchemy.exc import OperationalError

    from app.extensions import db

    register_user(client)

    def _boom(*args, **kwargs):
        raise OperationalError("stmt", {}, Exception("connection lost"))

    monkeypatch.setattr(db.session, "commit", _boom)
    response = create_note(client, title="Will fail", content="body")
    assert response.status_code == 500
    payload = response.get_json()
    assert payload["code"] == "server_error"
    assert "Traceback" not in payload["message"]
    assert "connection lost" not in payload["message"]
