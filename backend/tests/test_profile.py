"""Profile: update name, change password (session invalidation), deletion."""

from tests.conftest import register_user


def test_get_and_update_profile(client):
    _, email, _ = register_user(client)

    profile = client.get("/api/profile")
    assert profile.status_code == 200
    assert profile.get_json()["user"]["fullName"] == "Test User"

    updated = client.put("/api/profile", json={"fullName": "Renamed Person"})
    assert updated.status_code == 200
    assert updated.get_json()["user"]["fullName"] == "Renamed Person"

    me = client.get("/api/auth/me").get_json()["user"]
    assert me["fullName"] == "Renamed Person"
    assert me["email"] == email  # email is not editable


def test_profile_update_validation(client):
    register_user(client)
    assert client.put("/api/profile", json={"fullName": ""}).status_code == 422
    assert client.put("/api/profile", json={"fullName": "x"}).status_code == 422


def test_change_password_requires_correct_current(client):
    _, _, password = register_user(client)

    wrong = client.post(
        "/api/profile/password",
        json={"currentPassword": "not-my-pass", "newPassword": "brandnew1"},
    )
    assert wrong.status_code == 400
    assert "incorrect" in wrong.get_json()["message"].lower()

    missing = client.post(
        "/api/profile/password", json={"newPassword": "brandnew1"}
    )
    assert missing.status_code == 422

    weak = client.post(
        "/api/profile/password",
        json={"currentPassword": password, "newPassword": "short"},
    )
    assert weak.status_code == 422

    same = client.post(
        "/api/profile/password",
        json={"currentPassword": password, "newPassword": password},
    )
    assert same.status_code == 422


def test_change_password_invalidates_other_sessions(client, app):
    _, email, password = register_user(client)

    # Simulate a second device with its own cookie jar.
    other = app.test_client()
    assert other.post(
        "/api/auth/login", json={"email": email, "password": password}
    ).status_code == 200

    changed = client.post(
        "/api/profile/password",
        json={"currentPassword": password, "newPassword": "brandnew12"},
    )
    assert changed.status_code == 200

    # The session that changed the password stays signed in...
    assert client.get("/api/auth/me").status_code == 200
    # ...but every other session is immediately rejected.
    assert other.get("/api/auth/me").status_code == 401

    # And the old password no longer works.
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": password}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": "brandnew12"}
        ).status_code
        == 200
    )


def test_delete_account_requires_password(client):
    register_user(client)

    assert client.delete("/api/profile", json={}).status_code == 422
    assert (
        client.delete("/api/profile", json={"password": "wrong-pass-1"}).status_code == 400
    )


def test_delete_account_removes_user_and_all_data(client):
    _, email, password = register_user(client)

    categories = client.get("/api/categories").get_json()["categories"]
    work = next(c for c in categories if c["name"] == "Work")
    create = client.post(
        "/api/notes",
        json={"title": "Doomed", "content": "will be deleted", "categoryId": work["id"], "tags": ["bye"]},
    )
    assert create.status_code == 201

    assert client.delete("/api/profile", json={"password": password}).status_code == 204

    # Session is dead and the account cannot sign back in.
    assert client.get("/api/auth/me").status_code == 401
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 401
