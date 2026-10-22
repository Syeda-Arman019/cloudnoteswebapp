# CloudNotes REST API

Base URL in development: `http://localhost:5000/api` (the Vite dev server proxies
`/api` → `127.0.0.1:5000`, so browser requests are same-origin).

All request and response bodies are JSON (`Content-Type: application/json`), except
export downloads, which return binary files. Timestamps are ISO-8601 UTC with a
trailing `Z` (e.g. `2026-10-21T16:45:54Z`).

---

## Authentication

Session-based, **cookie-first** — no tokens reach localStorage or JavaScript.

- `POST /auth/login` and `POST /auth/register` set `cloudnotes_session`, an
  **HttpOnly, SameSite=Lax** cookie (Secure in production) signed by Flask.
- The cookie carries only `{"uid": <user id>, "sv": <session version>}`. Every
  request re-validates the user **and** the session version server-side, so
  bumping `session_version` instantly invalidates every existing cookie
  (password change, account deletion).
- Default lifetime: 168 hours (`SESSION_HOURS`).
- Mutating requests additionally verify the `Origin` header against
  `CORS_ORIGINS` (403 otherwise); non-browser clients without an `Origin`
  header are allowed and still protected by `SameSite=Lax`.
- Failed login responses are deliberately generic (`Incorrect email or
  password.`) and rate-limited: **10 attempts / 5 minutes per process**
  (`LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW`) → HTTP 429.

Every endpoint except `POST /auth/register`, `POST /auth/login`, and
`GET /health` requires the session cookie and returns **401** when missing or
invalid.

---

## Error format

Every error response has a stable shape the frontend surfaces as a toast:

```json
{
  "message": "Human-readable explanation.",
  "code": "invalid_input",
  "details": { "field": "title" }
}
```

`code` is derived from the status (`bad_request`, `unauthorized`, `forbidden`,
`not_found`, `conflict`, `payload_too_large`, `invalid_input`, `rate_limited`,
`server_error`). `details.field` is present for validation errors so forms can
highlight the input. Stack traces and secrets are logged server-side and never
returned.

| Status | Meaning                                                |
| ------ | ------------------------------------------------------ |
| 400    | Malformed body, wrong current password, bad query value |
| 401    | Not signed in / session invalidated                    |
| 403    | Foreign origin, or protected resource (default category) |
| 404    | Missing resource **or** another user's resource        |
| 409    | Duplicate email / category name                        |
| 413    | Body over 1 MiB (`MAX_CONTENT_LENGTH`)                 |
| 422    | Validation failure (`details.field` set)               |
| 429    | Login rate limit exceeded                              |
| 500    | Unexpected server error (message is generic)           |

A missing note and another user's note both return the **same 404**, so the API
never leaks the existence of other people's data.

---

## Shapes

```jsonc
// User
{ "id": 1, "fullName": "Ada Lovelace", "email": "ada@example.com",
  "role": "member", "createdAt": "2026-10-21T16:45:54Z" }

// Note
{ "id": 2, "title": "Instrumented note", "content": "# Heading…",
  "categoryId": 1,                      // or null
  "category": { "id": 1, "name": "Work", ... } | null,
  "tags": ["traced"], "isPinned": false,
  "createdAt": "…Z", "updatedAt": "…Z" }

// Category (noteCount only on list/create/update responses)
{ "id": 1, "name": "Work", "description": "…", "color": "work",
  "isDefault": true, "createdAt": "…Z", "noteCount": 3 }
```

---

## Endpoints

### Health

| Method | Path        | Auth | Response |
| ------ | ----------- | ---- | -------- |
| GET    | `/health`   | —    | `{ "status": "ok", "service": "cloudnotes-api", "database": "up", "environment": "development" }` — 503 with `database: "down"` when the DB is unreachable |

### Authentication — `/auth`

| Method | Path            | Body | Response |
| ------ | --------------- | ---- | -------- |
| POST   | `/auth/register` | `{ fullName, email, password }` | **201** `{ user }` + session cookie; seeds the five default categories |
| POST   | `/auth/login`    | `{ email, password }` | **200** `{ user }` + session cookie |
| POST   | `/auth/logout`   | — | **204**, clears the cookie |
| GET    | `/auth/me`       | — | `{ user }` or **401** |

### Notes — `/notes`

| Method | Path                 | Body / query | Response |
| ------ | -------------------- | ------------ | -------- |
| GET    | `/notes`             | filters below | `{ notes: [Note], pagination: { page, perPage, total, totalPages } }` |
| POST   | `/notes`             | `{ title, content, categoryId?, tags?, isPinned? }` | **201** `{ note }` |
| GET    | `/notes/:id`         | — | `{ note }` |
| PUT    | `/notes/:id`         | partial `{ title?, content?, categoryId?, tags?, isPinned? }` | `{ note }` |
| DELETE | `/notes/:id`         | — | **204** |
| PATCH  | `/notes/:id/pin`     | `{ isPinned: bool }` | `{ note }` |

**List query parameters** (all optional):

| Param      | Values                                   | Default   |
| ---------- | ---------------------------------------- | --------- |
| `q`        | substring match on title/content (case-insensitive) | — |
| `category` | category id, or `uncategorized`          | all       |
| `pinned`   | `true` / `false` (also `1`/`0`, `pinned`/`unpinned`) | all |
| `tag`      | tag name, case-insensitive               | all       |
| `sort`     | `newest` \| `oldest` \| `updated`        | `newest`  |
| `page`     | ≥ 1                                      | `1`       |
| `per_page` | 1–100                                    | `50`      |

Notes owned by other users are never visible: every query is scoped by
`user_id`.

### Dashboard — `/dashboard`

| Method | Path          | Response |
| ------ | ------------- | -------- |
| GET    | `/dashboard`  | `{ stats: { total, pinned, categories, uncategorized, updatedThisWeek }, recentNotes: [Note] }` — `recentNotes` is the 5 most recently updated |

### Categories — `/categories` and `/tags`

| Method | Path                  | Body | Response |
| ------ | --------------------- | ---- | -------- |
| GET    | `/categories`         | — | `{ categories: [Category], uncategorizedCount }` (categories sorted: defaults first, then name) |
| POST   | `/categories`         | `{ name, description?, color? }` | **201** `{ category }` |
| PUT    | `/categories/:id`     | partial `{ name?, description?, color? }` | `{ category }` |
| DELETE | `/categories/:id`     | — | **204** — notes are detached (set uncategorized), never deleted |
| GET    | `/tags`               | — | `{ tags: [{ name, noteCount }] }` |

The five defaults (`Work`, `Study`, `Personal`, `Ideas`, `Projects`) are
created at registration, cannot be renamed (**403**) and cannot be deleted
(**403**). Duplicate names (case-insensitive) within one account → **409**.
Valid colors: `work`, `study`, `personal`, `ideas`, `projects`, `default`.

### Profile — `/profile`

| Method | Path                  | Body | Response |
| ------ | --------------------- | ---- | -------- |
| GET    | `/profile`            | — | `{ user }` |
| PUT    | `/profile`            | `{ fullName }` | `{ user }` |
| POST   | `/profile/password`   | `{ currentPassword, newPassword }` | `{ user }` — verifies the current password, rejects reuse, bumps `session_version` (other sessions die immediately; the caller is re-issued a session) |
| DELETE | `/profile`            | `{ password }` | **204** — password is required server-side (422 without it, 400 if wrong); deletes the account and **all** owned data, ends the session |

### Exports — `/notes/:id/export/:format`

| Method | Path                              | Response |
| ------ | --------------------------------- | -------- |
| GET    | `/notes/:id/export/:format`       | Binary file download (`Content-Disposition: attachment`) |

- `format`: `pdf` \| `docx` \| `txt` \| `md`
- Built fresh in memory from the current database row; nothing is stored.
- Filename is an ASCII-safe slug of the title (`my-note.pdf`).
- Ownership applies: foreign/missing notes → 404; unauthenticated → 401.
- PDF (ReportLab, A4, multi-page, Unicode) and DOCX (python-docx) render the
  markdown subset as styled paragraphs; TXT/Markdown pass the source through
  with a small header block.

---

## Validation rules (server-side, authoritative)

The frontend repeats these for instant feedback — the server never trusts it.

| Field        | Rule |
| ------------ | ---- |
| `email`      | required, ≤ 255, must match `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, stored lowercased |
| `fullName`   | required, trimmed/collapsed, 2–80 chars |
| `password`   | required, 8–128 chars, at least one letter and one digit |
| `title`      | required, ≤ 120 chars |
| `content`    | required (create), ≤ 40,000 chars |
| `categoryId` | `null`/absent, or an id owned by the user (else 422) |
| `tags`       | list of strings, ≤ 24 chars each, ≤ 8 per note, deduplicated case-insensitively, `#` stripped |
| `color`      | one of the six allowed keys |
| `name` (category) | required, 2–40 chars, unique per account (409) |
| `description` (category) | ≤ 160 chars |

Request bodies must be JSON objects (otherwise **400** `Request body must be a
JSON object.`), and payloads over 1 MiB are rejected with **413**.
