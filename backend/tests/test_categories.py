"""Categories (CRUD, counts, defaults) and tags API tests."""

from tests.conftest import create_note, register_user


def test_default_categories_seeded_once(client):
    register_user(client)
    categories = client.get("/api/categories").get_json()["categories"]
    assert len(categories) == 5
    assert all(c["isDefault"] for c in categories)
    assert all(c["noteCount"] == 0 for c in categories)


def test_create_custom_category(client):
    register_user(client)
    response = client.post(
        "/api/categories",
        json={"name": "Research", "description": "Papers and readings", "color": "violet"},
    )
    # 'violet' is not in the allowed palette → rejected.
    assert response.status_code == 422

    response = client.post(
        "/api/categories",
        json={"name": "Research", "description": "Papers and readings", "color": "study"},
    )
    assert response.status_code == 201
    category = response.get_json()["category"]
    assert category["name"] == "Research"
    assert category["isDefault"] is False
    assert category["noteCount"] == 0


def test_duplicate_category_name_rejected_case_insensitive(client):
    register_user(client)
    client.post("/api/categories", json={"name": "Reading", "color": "default"})
    duplicate = client.post("/api/categories", json={"name": "reading", "color": "default"})
    assert duplicate.status_code == 409

    # Default names are also protected against collisions.
    clash_default = client.post("/api/categories", json={"name": "work", "color": "work"})
    assert clash_default.status_code == 409


def test_rename_and_recolor_custom_category(client):
    register_user(client)
    category = client.post(
        "/api/categories", json={"name": "Scratch", "color": "default"}
    ).get_json()["category"]

    updated = client.put(
        f"/api/categories/{category['id']}",
        json={"name": "Longform", "description": "Essays", "color": "ideas"},
    )
    assert updated.status_code == 200
    body = updated.get_json()["category"]
    assert body["name"] == "Longform"
    assert body["color"] == "ideas"
    assert body["description"] == "Essays"


def test_default_categories_are_protected(client):
    register_user(client)
    defaults = client.get("/api/categories").get_json()["categories"]
    work = next(c for c in defaults if c["name"] == "Work")

    rename = client.put(f"/api/categories/{work['id']}", json={"name": "Renamed"})
    assert rename.status_code == 403
    delete = client.delete(f"/api/categories/{work['id']}")
    assert delete.status_code == 403


def test_delete_custom_category_keeps_notes(client):
    register_user(client)
    category = client.post(
        "/api/categories", json={"name": "Temp", "color": "default"}
    ).get_json()["category"]
    note = create_note(client, title="Survivor", categoryId=category["id"]).get_json()["note"]

    assert client.delete(f"/api/categories/{category['id']}").status_code == 204

    # The note survives and is now uncategorized.
    fetched = client.get(f"/api/notes/{note['id']}").get_json()["note"]
    assert fetched["categoryId"] is None

    remaining = client.get("/api/categories").get_json()["categories"]
    assert "Temp" not in {c["name"] for c in remaining}


def test_note_counts_are_computed_from_database(client):
    register_user(client)
    categories = client.get("/api/categories").get_json()["categories"]
    work = next(c for c in categories if c["name"] == "Work")
    study = next(c for c in categories if c["name"] == "Study")

    create_note(client, title="A", categoryId=work["id"])
    create_note(client, title="B", categoryId=work["id"])
    create_note(client, title="C", categoryId=study["id"])
    create_note(client, title="D")  # uncategorized

    payload = client.get("/api/categories").get_json()
    counts = {c["name"]: c["noteCount"] for c in payload["categories"]}
    assert counts["Work"] == 2
    assert counts["Study"] == 1
    assert counts["Ideas"] == 0
    assert payload["uncategorizedCount"] == 1


def test_category_names_validation(client):
    register_user(client)
    assert client.post("/api/categories", json={"name": ""}).status_code == 422
    assert client.post("/api/categories", json={"name": "a"}).status_code == 422
    assert (
        client.post("/api/categories", json={"name": "x" * 41}).status_code == 422
    )


def test_categories_cannot_be_touched_across_users(client):
    register_user(client)
    category = client.post(
        "/api/categories", json={"name": "Mine", "color": "default"}
    ).get_json()["category"]

    client.post("/api/auth/logout")
    register_user(client)

    assert client.put(f"/api/categories/{category['id']}", json={"name": "Stolen"}).status_code == 404
    assert client.delete(f"/api/categories/{category['id']}").status_code == 404

    names = {c["name"] for c in client.get("/api/categories").get_json()["categories"]}
    assert "Mine" not in names  # B sees only their own seeded defaults


def test_tag_lifecycle_and_listing(client):
    register_user(client)
    create_note(client, title="Tagged", tags=["python", "flask"])
    create_note(client, title="Also tagged", tags=["python"])

    tags = client.get("/api/tags").get_json()["tags"]
    by_name = {t["name"]: t["noteCount"] for t in tags}
    assert by_name == {"flask": 1, "python": 2}

    # Tags belong to the owner: a second user sees none of them.
    client.post("/api/auth/logout")
    register_user(client)
    assert client.get("/api/tags").get_json()["tags"] == []
