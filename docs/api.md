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

### Classes — `/classes` (Part 2)

All class endpoints require a session. **Non-members get 404** for the class and
everything under it (the API never confirms a class exists to outsiders);
**owner-only actions get 403** for plain members. The actor/sender is always
derived from the session — a client-supplied user id, role or membership flag
is ignored.

| Method | Path | Body / query | Response |
| ------ | ---- | ------------ | -------- |
| GET    | `/classes` | — | `{ classes: [{ id, name, description, ownerId, createdAt, memberCount, unreadCount, myRole, joinedAt }] }` — only the caller's classes |
| POST   | `/classes` | `{ name, description? }` | **201** `{ class }` — caller becomes `owner` |
| GET    | `/classes/:id` | — | `{ class }` with `myRole`, `memberCount`, `joinedAt` |
| PATCH  | `/classes/:id` | `{ name?, description? }` | `{ class }` — owner only (403) |
| DELETE | `/classes/:id` | — | **204** — owner only; members/invitations/chat removed, shared resources revert to private (SET NULL), personal files/notes are never deleted |
| GET    | `/classes/:id/members` | — | `{ members: [{ role, joinedAt, lastReadAt, user: { id, fullName, initials }, isOnline }], onlineCount }` — members only |
| DELETE | `/classes/:id/members/:userId` | — | **204** — owner only; removal revokes materials, chat and shared-resource access immediately |
| POST   | `/classes/:id/leave` | — | `{ left: true }` — members may leave; the last owner cannot leave without transferring (409 `transfer_required`) |
| POST   | `/classes/:id/transfer` | `{ memberId }` | `{ class }` — owner only; makes the target the new owner |

### Invitations — `/classes/:id/invitations`, `/invitations/*`

| Method | Path | Body / query | Response |
| ------ | ---- | ------------ | -------- |
| GET    | `/classes/:id/invitations` | — | `{ invitations: [{ id, status, expiresAt, maxUses, useCount, createdAt }] }` — **never includes the token or its hash**; owner only |
| POST   | `/classes/:id/invitations` | `{ expiresInHours? (1–2160), maxUses? }` | **201** `{ invitation: { …, token } }` — **the raw token appears exactly once**, here; owner only; rate-limited (`INVITE_RATE_*`) |
| DELETE | `/classes/:id/invitations/:invitationId` | — | `{ revoked: true }` — owner only; revocation is immediate |
| GET    | `/invitations/preview?token=…` | — | `{ class: { id, name, description, ownerName }, expiresAt }` — safe details for the confirm screen; 404 for unknown/expired/revoked/exhausted tokens |
| POST   | `/invitations/join` | `{ token }` | `{ class, membership }` — creates the membership for the **session's** user; re-joining an existing membership is a safe no-op (no duplicate row, unique constraint enforced) |

Joining validates the invitation server-side (hash lookup, expiry, revocation,
usage limit with atomic use counting) — an invitation never substitutes for
authentication or authorization.

### Sharing & materials — `/shares`, `/classes/:id/materials`

| Method | Path | Body / query | Response |
| ------ | ---- | ------------ | -------- |
| POST   | `/shares` | `{ resourceType: file \| folder \| note, resourceId, classId }` | `{ shared: true, classId }` — resource must be **owned by the caller** and caller must be a member of `classId`; foreign resource → 404 (no existence leak) |
| POST   | `/shares/unshare` | `{ resourceType, resourceId }` | `{ shared: false }` — owner of the resource only; access revokes on the next request |
| GET    | `/classes/:id/shared?type=file` | `type` = `file` \| `folder` \| `note` | `{ resources }` — everything **the caller** shared with this class |
| GET    | `/classes/:id/materials?q=` | optional search | `{ files, folders, notes }` — only resources shared **with this class**; members only; never exposes unshared personal data |

Preview/download of a shared file re-checks membership on **every** request
(`/files/:id/preview`, `/files/:id/download`): after unsharing, removal or
leaving, the next request is 404.

### Class chat — `/classes/:id/messages`, `/messages/:id`

| Method | Path | Body / query | Response |
| ------ | ---- | ------------ | -------- |
| GET    | `/classes/:id/messages` | `?before=<id>&after=<id>&limit=≤40` | `{ messages: [...], hasMore }` — ascending by id/time; `after` powers the 4 s poll; members only |
| POST   | `/classes/:id/messages` | `{ content?, replyToId?, attachmentIds? }` | **201** `{ message }` — `content` ≤ 4 000 chars; `senderId` from the session; `replyToId` must be a message of the **same class** (else 422); `attachmentIds` must be the caller's pending uploads for this class, each claimable once (409 on reuse) |
| PATCH  | `/messages/:id` | `{ content }` | `{ message }` — sender only (others 404/403); sets `editedAt` |
| DELETE | `/messages/:id` | — | **204** — sender or class owner (moderation); tombstones the row (`isDeleted`, content cleared) so replies and attachments stay consistent |

Messages render as plain text in the UI (no HTML interpretation). Pagination
is bounded (40 per page) — there is no unbounded history endpoint.

### Chat attachments — `/classes/:id/attachments`, `/attachments/:id/*`

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| POST   | `/classes/:id/attachments` | `multipart/form-data`: `file`, `kind` = `image` \| `document` \| `audio` | **201** `{ attachment }` — extension + magic-byte content checks (browser MIME is not trusted), size limits `CHAT_MAX_IMAGE_MB` (10) / `CHAT_MAX_DOC_MB` (25) / `CHAT_MAX_AUDIO_MB` (15); `message_id` stays `NULL` until claimed by a message POST; rate-limited (`UPLOAD_RATE_*`) |
| GET    | `/attachments/:id/content` | — | Inline bytes (`Content-Disposition: inline`, safe content type) — **current class members only**; the `class_id` is denormalized on the row, so an id from another class is 404 |
| GET    | `/attachments/:id/download` | — | Attachment download (`Content-Disposition: attachment`, sanitized filename) — same membership check |

Bytes live in the private `UPLOAD_FOLDER` (random stored name, no path
traversal, never a public static directory).

### Presence & read state — `/classes/:id/heartbeat`, `/classes/:id/read`

| Method | Path | Response |
| ------ | ---- | -------- |
| POST   | `/classes/:id/heartbeat` | `{ onlineUserIds: [...], ttlSeconds: 90 }` — records an authenticated heartbeat; returns **unique** users with a heartbeat younger than 90 s (multiple tabs count once; stale entries are pruned). Single-process in-memory store — see the README limitations. |
| POST   | `/classes/:id/read` | `{ unreadCount: 0 }` — sets `last_read_at` for the caller, which drives the sidebar unread badge |

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
| `name` (class) | required, ≤ 120 chars |
| `description` (class) | ≤ 400 chars |
| `expiresInHours` (invite) | 1–2 160 (90 days); `maxUses` ≥ 1 when given |
| `content` (chat message) | optional when `attachmentIds` present, ≤ 4 000 chars |
| `replyToId` (chat message) | must reference a message of the same class |
| `resourceType` (share) | one of `file`, `folder`, `note`; resource must be owned by the caller |
| chat upload | allowed extensions per kind with magic-byte checks; `image` ≤ 10 MB, `document` ≤ 25 MB, `audio` ≤ 15 MB |

Request bodies must be JSON objects (otherwise **400** `Request body must be a
JSON object.`), and payloads over 1 MiB are rejected with **413**.
