"""Registration, login, logout, session, and rate-limit tests."""

from tests.conftest import register_user


def test_register_success_creates_user_and_default_categories(client):
    response, email, _ = register_user(client)
    assert response.status_code == 201
    user = response.get_json()["user"]
    assert user["email"] == email
    assert user["fullName"] == "Test User"
    assert "password" not in response.get_json()["user"]

    categories = client.get("/api/categories").get_json()["categories"]
    names = {c["name"] for c in categories}
    assert names == {"Work", "Study", "Personal", "Ideas", "Projects"}
    assert all(c["isDefault"] for c in categories)


def test_register_session_cookie_is_hardened(client):
    response, _, _ = register_user(client)
    cookie = next(iter(response.headers.getlist("Set-Cookie")))
    assert "cloudnotes_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie
    assert "Password" not in cookie and "secret" not in cookie


def test_register_rejects_duplicate_email_case_insensitive(client):
    _, email, _ = register_user(client)
    client.post("/api/auth/logout")
    response = client.post(
        "/api/auth/register",
        json={"fullName": "Copy Cat", "email": email.upper(), "password": "secret123"},
    )
    assert response.status_code == 409
    assert "already exists" in response.get_json()["message"]


def test_register_validation_errors(client):
    cases = [
        {"fullName": "", "email": "a@b.co", "password": "secret123"},
        {"fullName": "Valid Name", "email": "not-an-email", "password": "secret123"},
        {"fullName": "Valid Name", "email": "a@b.co", "password": "short"},
        {"fullName": "Valid Name", "email": "a@b.co", "password": "alllettersonly"},
        {"fullName": "Valid Name", "email": "a@b.co", "password": "12345678"},
    ]
    for payload in cases:
        client.post("/api/auth/logout")
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 422, payload
        assert "message" in response.get_json()


def test_register_requires_json_object(client):
    response = client.post("/api/auth/register", data="not json", content_type="text/plain")
    assert response.status_code in (400, 415, 422)
    assert "message" in response.get_json()


def test_login_success_and_me_endpoint(client):
    _, email, password = register_user(client)
    client.post("/api/auth/logout")

    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    assert response.get_json()["user"]["email"] == email

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["email"] == email


def test_login_invalid_credentials_are_generic(client):
    _, email, _ = register_user(client)
    client.post("/api/auth/logout")

    wrong_password = client.post(
        "/api/auth/login", json={"email": email, "password": "wrongpass1"}
    )
    assert wrong_password.status_code == 401
    assert wrong_password.get_json()["message"] == "Incorrect email or password."

    unknown_email = client.post(
        "/api/auth/login", json={"email": "ghost@example.com", "password": "whatever1"}
    )
    assert unknown_email.status_code == 401
    # Same message for unknown emails — no account enumeration.
    assert unknown_email.get_json()["message"] == "Incorrect email or password."


def test_me_requires_authentication(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.get_json()["code"] == "unauthorized"


def test_logout_invalidates_session(client):
    register_user(client)
    assert client.get("/api/auth/me").status_code == 200

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_login_rate_limiting(client):
    _, email, _ = register_user(client)
    client.post("/api/auth/logout")

    # TestingConfig allows 5 attempts per window.
    for _ in range(5):
        client.post("/api/auth/login", json={"email": email, "password": "badpass1"})

    blocked = client.post("/api/auth/login", json={"email": email, "password": "badpass1"})
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "rate_limited"
    assert "Try again" in blocked.get_json()["message"]


def test_successful_login_resets_rate_limit_counter(client):
    _, email, password = register_user(client)
    client.post("/api/auth/logout")

    for _ in range(4):
        client.post("/api/auth/login", json={"email": email, "password": "badpass1"})
    ok = client.post("/api/auth/login", json={"email": email, "password": password})
    assert ok.status_code == 200
    # Counter was reset by the success — more bad attempts are allowed again.
    for _ in range(3):
        again = client.post("/api/auth/login", json={"email": email, "password": "badpass1"})
        assert again.status_code == 401


def test_mutations_from_disallowed_origin_are_rejected(client):
    register_user(client)
    response = client.post(
        "/api/notes",
        json={"title": "x", "content": "y"},
        headers={"Origin": "https://evil.example.com"},
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "forbidden"


def test_allowed_origin_is_accepted(client):
    from flask import current_app  # noqa: F401  (documented behaviour check)

    register_user(client)
    allowed_origin = "http://localhost:5173"
    response = client.post(
        "/api/notes",
        json={"title": "from vite", "content": "body"},
        headers={"Origin": allowed_origin},
    )
    assert response.status_code == 201
