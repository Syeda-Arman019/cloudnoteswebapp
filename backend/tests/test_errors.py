"""Cross-cutting error handling, JSON shapes, and hardening tests."""

from tests.conftest import create_note, register_user


def test_unknown_route_returns_json_404(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    payload = response.get_json()
    assert payload["message"]
    assert payload["code"] == "not_found"


def test_wrong_method_returns_json_405(client):
    response = client.delete("/api/auth/login")
    assert response.status_code == 405
    assert response.get_json()["message"]


def test_oversized_payload_rejected(client, app):
    register_user(client)
    # The request ceiling is configurable (uploads need headroom), so pin it
    # to the classic 1 MiB here to verify the 413 path itself.
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
    try:
        huge = "x" * (1024 * 1024 + 1024)
        response = client.post("/api/notes", json={"title": "big", "content": huge})
        assert response.status_code == 413
    finally:
        app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024


def test_no_stack_traces_leak_on_bad_input(client):
    register_user(client)
    response = client.post("/api/notes", json=["not", "an", "object"])
    assert response.status_code == 400
    payload = response.get_json()
    assert "Traceback" not in payload["message"]
    assert payload["code"] == "bad_request"


def test_health_endpoint_reports_database(app, client):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["database"] == "up"
    assert payload["environment"] == "testing"


def test_list_response_shapes_are_stable(client):
    register_user(client)
    create_note(client, title="Shape check", tags=["x"])

    notes = client.get("/api/notes").get_json()
    assert set(notes.keys()) == {"notes", "pagination"}
    note = notes["notes"][0]
    for key in ("id", "title", "content", "categoryId", "tags", "isPinned", "createdAt", "updatedAt"):
        assert key in note

    categories = client.get("/api/categories").get_json()
    assert set(categories.keys()) == {"categories", "uncategorizedCount"}
    category = categories["categories"][0]
    for key in ("id", "name", "description", "color", "isDefault", "noteCount"):
        assert key in category

    dashboard = client.get("/api/dashboard").get_json()
    assert set(dashboard.keys()) == {"stats", "recentNotes"}
    assert set(dashboard["stats"].keys()) == {
        "total",
        "pinned",
        "categories",
        "uncategorized",
        "updatedThisWeek",
    }


def test_foreign_category_assignment_rejected(client):
    register_user(client)
    # User A's category.
    category = client.post(
        "/api/categories", json={"name": "A-only", "color": "default"}
    ).get_json()["category"]

    client.post("/api/auth/logout")
    register_user(client)

    response = create_note(client, title="Sneaky", categoryId=category["id"])
    assert response.status_code == 422
    assert response.get_json()["details"]["field"] == "categoryId"
