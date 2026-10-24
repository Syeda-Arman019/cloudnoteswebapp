# CloudNotes

**Your thoughts, organized anywhere.**

CloudNotes is a cloud-based notes and productivity platform for personal, study, work, and
project notes. This repository contains the **full stack**: a React frontend, a Flask REST
API with cookie-based authentication, a MySQL/SQLite database, real document exports, and an
automated test suite.

> **Project status — Part 2 complete (class collaboration).**
> Notes, folders, files and exports (Part 1) plus secure classes, invitation-based joining,
> class-shared materials, persistent chat with image/document/voice attachments, real presence
> and unread indicators (Part 2) are implemented and verified: **195 pytest tests passing**
> (1 MySQL smoke test skips without `MYSQL_TEST_URL`) and the production frontend build
> succeeds. **Part 3** (cloud deployment) is next.

---

## Tech stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Frontend   | React 18 + Vite 6 (JavaScript), React Router v6               |
| Backend    | Flask 3 + Flask-SQLAlchemy + Flask-Migrate + Flask-Cors        |
| Database   | MySQL 8 (PyMySQL) primary; SQLite for tests/dev fallback       |
| Auth       | Server-side sessions in an HttpOnly `SameSite=Lax` cookie      |
| Exports    | ReportLab (PDF), python-docx (DOCX), plain TXT/Markdown        |
| Styling    | Custom CSS design system + Bootstrap 5 (utilities/reboot)     |
| Icons      | Lucide React                                                  |
| State      | React Context (theme, auth, notifications, notes/categories)  |
| Tests      | pytest (API, auth, exports, errors, MySQL smoke)               |

---

## Getting started

Full instructions: **[docs/local-development.md](docs/local-development.md)**.

### 1 — Backend

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip.exe install -r requirements.txt
cp .env.example .env            # set SECRET_KEY + DATABASE_URL (MySQL)
.venv/Scripts/flask.exe db upgrade
.venv/Scripts/python.exe run.py # → http://127.0.0.1:5000/api/health
```

### 2 — Frontend

```bash
npm install
cp .env.example .env            # VITE_API_URL=/api (dev proxy)
npm run dev                     # → http://localhost:5173
```

The Vite dev server proxies `/api` to Flask, so the session cookie is
same-origin and CORS never gets in the way. Register an account in the UI and
you are running the whole stack.

### Tests and builds

```bash
cd backend && .venv/Scripts/python.exe -m pytest    # 195 passed, 1 MySQL smoke (skips w/o URL)
npm run build                                      # production bundle → dist/
```

---

## Environment variables

| File | Variable | Purpose |
| ---- | -------- | ------- |
| `.env` (frontend) | `VITE_API_URL` | API base path/URL. **`/api`** uses the dev proxy (recommended); a full URL like `http://127.0.0.1:5000/api` also works. Empty ⇒ **demo mode, development builds only** — production builds always call the real API. |
| `.env` (frontend) | `VITE_PROXY_TARGET` | Dev-proxy target (default `http://127.0.0.1:5000`). |
| `backend/.env` | `DATABASE_URL` | Database connection (MySQL primary). Required in production — the app refuses to boot without it. |
| `backend/.env` | `SECRET_KEY` | Session cookie signing key (required in production). |
| `backend/.env` | `SESSION_HOURS`, `SESSION_COOKIE_SECURE`, `CORS_ORIGINS`, `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW` | Session/CORS/rate-limit tuning (see `backend/.env.example`). |
| `backend/.env` | `MAX_UPLOAD_MB`, `MAX_REQUEST_MB` | Study Library upload size limits (default 25 MB / ×4). |
| `backend/.env` | `CHAT_MAX_IMAGE_MB`, `CHAT_MAX_DOC_MB`, `CHAT_MAX_AUDIO_MB` | Chat attachment limits (default 10 / 25 / 15 MB). |
| `backend/.env` | `INVITE_RATE_*`, `MESSAGE_RATE_*`, `UPLOAD_RATE_*` | Rate windows for invitation creation, chat messages and uploads (defaults 20/h, 60/min, 40/min). |
| `backend/.env` | `UPLOAD_FOLDER` | Private storage directory for uploads and chat attachments (default `backend/uploads`). |

---

## Demo mode

Demo mode is a **development-only** convenience: with `VITE_API_URL` unset, services fall
back to an isolated `localStorage` store (`demo@cloudnotes.app`, any password) so the UI can
be explored without a backend. **Passwords are never stored, no network requests are made,
and demo mode is compiled out of production builds** — a production build with no API URL
expects a same-origin API and never fabricates data.

---

## Routes

| Route             | Page                       | Access      |
| ----------------- | -------------------------- | ----------- |
| `/`               | Landing page               | Public      |
| `/register`       | Registration               | Public      |
| `/login`          | Login                      | Public      |
| `/dashboard`      | Productivity dashboard     | Protected   |
| `/notes`          | All notes (search/filter)  | Protected   |
| `/notes/new`      | Create note                | Protected   |
| `/notes/:id`      | Note details + export menu | Protected   |
| `/notes/:id/edit` | Edit note                  | Protected   |
| `/categories`     | Category management        | Protected   |
| `/settings`       | Profile, theme, account    | Protected   |
| `/classes`        | My classes (create/join)   | Protected   |
| `/classes/join`   | Join a class (invite link) | Protected   |
| `/classes/:id`    | Class overview/materials/members/chat/settings | Protected |
| `*`               | Custom 404                 | Public      |

Protected routes show a session-restore loader, then redirect to `/login` and return to the
original page after signing in.

---

## REST API (summary)

Full contract — request/response bodies, validation, errors: **[docs/api.md](docs/api.md)**.

```
GET    /api/health
POST   /api/auth/register     POST /api/auth/login     POST /api/auth/logout     GET /api/auth/me
GET    /api/notes             POST /api/notes          GET/PUT/DELETE /api/notes/:id
PATCH  /api/notes/:id/pin     GET  /api/dashboard
GET    /api/categories        POST /api/categories     PUT/DELETE /api/categories/:id
GET    /api/tags
GET    /api/profile           PUT /api/profile         POST /api/profile/password
DELETE /api/profile           (requires { password })
GET    /api/notes/:id/export/:format      format = pdf | docx | txt | md → file download

# Files & folders (Part 1)
GET/POST /api/folders         GET/PUT/DELETE /api/folders/:id   GET /api/folders/:id/contents
GET/POST /api/files           GET/PUT/DELETE /api/files/:id     GET /api/files/:id/download
GET    /api/files/:id/preview              GET /api/files/:id/preview/text
PATCH  /api/files/:id/restore   DELETE /api/files/:id/purge   POST /api/files/zip   GET /api/files/stats

# Classes, invitations, sharing (Part 2)
GET/POST /api/classes                GET/PATCH/DELETE /api/classes/:id
GET    /api/classes/:id/members      DELETE /api/classes/:id/members/:userId
POST   /api/classes/:id/leave        POST /api/classes/:id/transfer
GET/POST /api/classes/:id/invitations   DELETE /api/classes/:id/invitations/:invitationId
GET    /api/invitations/preview?token=…   POST /api/invitations/join   (token, not class id)
POST   /api/shares                   POST /api/shares/unshare      (file | folder | note)
GET    /api/classes/:id/shared?type=…      GET /api/classes/:id/materials

# Class chat (Part 2)
GET/POST /api/classes/:id/messages   PATCH/DELETE /api/messages/:id
POST   /api/classes/:id/attachments       GET /api/attachments/:id/content
GET    /api/attachments/:id/download
POST   /api/classes/:id/heartbeat         POST /api/classes/:id/read
```

Notes: session cookie auth (`credentials: 'include'`), server-side validation with
`{ message, code, details }` errors, per-user scoping on every query (foreign resources
return the same 404 as missing ones), pagination (`per_page` ≤ 100), login rate limiting,
and an Origin check on mutating requests.

---

## Class collaboration (Part 2)

Every student uses their **own account** — no shared passwords, no phone number, no SMS.
The backend derives the sender/actor from the session on every request; a client-supplied
user id, role or membership flag is never trusted.

### Creating a class

1. Sign in → **My classes** → **Create class** (e.g. `23 Batch`). You become the **owner**.
2. The class gets its own chatroom, materials view, member list and invitation settings.

### Inviting classmates

**Class → Settings → Invitations** → pick an expiry (1 hour–90 days, or none) and an
optional max-uses limit → **Create invitation**. The raw link (`/classes/join?token=…`) is
shown **once** — only its SHA-256 hash is stored. Owners can revoke a link at any time;
expired, revoked and exhausted links are rejected server-side.

### Joining

A classmate opens the link (or pastes the code on **Join a class**), sees the class name,
description, owner and expiry, confirms, and joins with their own account. Re-joining is a
safe no-op — the unique `(class_id, user_id)` constraint prevents duplicate memberships.

### Roles

| Role | Can do |
| ---- | ------ |
| **Owner** | Rename/delete the class, manage invitations, remove members, transfer ownership, share/unshare resources, moderate chat |
| **Member** | Read class materials and chat, send messages/attachments, edit or delete their **own** messages, share their **own** resources with the class, leave |
| **Non-member** | Nothing — the API returns 404 (never confirming a class exists) for detail, messages, materials, members and attachments |

Owner-only endpoints return **403** to members; everything a non-member probes returns
**404**, so class ids, file ids, folder ids and attachment ids cannot be enumerated or
used across classes (IDOR checks are in the test suite).

### Personal vs class-shared resources

- **Personal files/folders/notes are private by default** — visible only to their owner.
- **Sharing is explicit**: file ⋯ menu → *Share with class* (or the note action bar) picks
  one class; only current members of that class can then open it, through the authorized
  API (preview/download re-check membership on every request, not just at link creation).
- **Unsharing, removing a member, or leaving the class revokes access immediately**
  (verified: 200 → 404 on the next request).
- The **Materials** tab lists only resources shared with that class; a class share never
  exposes the rest of the owner's library, and shared descendants inherit access.

### Class chat

Persistent per-class chat: sender display name + timestamps, replies, edit/delete of own
messages (tombstoned so replies stay valid), pagination (40 messages per page), 4 000
characters per message, plain-text rendering (no HTML injection). Near-real-time delivery
is **authenticated polling** every 4 s (see limitations below); the sidebar unread badge
updates from the server's per-member `last_read_at` and clears when the chat is opened.

### Attachments and voice messages

- **Images** (PNG/JPG/JPEG/WEBP) and **documents** (PDF/DOCX/PPTX/XLSX/TXT/MD) attach to
  messages; magic-byte checks validate real content, not just the browser's MIME type.
- **Voice**: *Record voice* → browser mic permission → record → preview → send. Playback
  uses an inline player for members only. Uploads are stored in the private upload store
  (never a public static directory) and served through the authorized content/download
  routes.
- Size limits (configurable): images 10 MB, documents 25 MB, voice 15 MB, Study Library
  uploads 25 MB (`CHAT_MAX_*_MB`, `MAX_UPLOAD_MB`).
- An attachment id can be attached to a message exactly once (409 on reuse), belongs to
  the class it was uploaded to, and is only retrievable by current members.

### Presence and notifications

Online presence is real: the chat posts an authenticated heartbeat every 25 s, the server
counts **unique users** with a heartbeat younger than 90 s (multiple tabs count once), and
stale heartbeats expire automatically. The unread badge refreshes from the server every
30 s and immediately when the tab regains focus.

### HTTPS and microphone access

Browsers only expose `getUserMedia` (microphone) in a **secure context**: HTTPS in
production, `localhost` in development. Without it the recorder shows an honest
unsupported/denied message instead of a dead button. Always deploy Part 2 behind HTTPS
with `SESSION_COOKIE_SECURE=true`.

---

## Project structure

```
cloudnoteswebapp/
├── index.html / package.json / vite.config.js / .env.example
├── docs/
│   ├── api.md                  # Full REST API reference
│   ├── database.md             # Schema, migrations, test isolation
│   └── local-development.md    # Running the whole stack
├── backend/
│   ├── app/
│   │   ├── __init__.py         # App factory (extensions, CORS, origin guard, errors)
│   │   ├── config.py           # development / testing / production configs
│   │   ├── models.py           # User, Category, Note, Tag, folders, files,
│   │   │                       #   StudyClass, ClassMembership, ClassInvitation,
│   │   │                       #   ChatMessage, ChatAttachment (Part 2)
│   │   ├── auth.py             # Session issue/validate, login_required
│   │   ├── validation.py       # Server-side validation (authoritative)
│   │   ├── errors.py           # ApiError + JSON error handlers
│   │   ├── rate_limit.py       # Sliding-window limiter (login, invites, chat, uploads)
│   │   ├── storage.py          # Private upload store (sanitized names, no traversal)
│   │   ├── file_validation.py  # Extension + magic-byte content checks
│   │   ├── content.py          # Shared markdown-subset parser
│   │   ├── routes/             # auth, notes, categories, profile, exports,
│   │   │                       #   folders, files, classes (Part 2)
│   │   └── services/           # auth/notes/categories/profile/folder/file services,
│   │                           #   class_service + chat_service (Part 2),
│   │                           #   export dispatch + pdf/docx builders
│   ├── migrations/             # Flask-Migrate (initial schema + Part 2 classes/chat)
│   ├── tests/                  # pytest suite (auth, notes, categories, profile,
│   │                           #   exports, errors, folders, files, note_folders,
│   │                           #   classes, chat — Part 2 — MySQL smoke)
│   ├── requirements.txt / .env.example / run.py / wsgi.py / pytest.ini
└── src/                        # React frontend (see docs/ and services/)
    ├── components/ context/ hooks/ layouts/ pages/ services/ styles/ utils/
    │   └── components/class/    # ChatRoom, VoiceRecorder, tabs, ShareDialog (Part 2)
    ├── services/apiClient.js   # Central fetch client, cookie auth, demo detection
    ├── services/classesService.js  # Class/invite/chat/attachment API (Part 2)
    └── services/mock/          # demo store (development only)
```

---

## Testing

- **Backend:** `pytest` — auth (registration, login, rate limits, sessions),
  notes CRUD + filtering + ownership, categories (defaults locked, detach-not-delete),
  profile (password change invalidates other sessions; deletion requires the password),
  all four export formats (binary magic checks), folders/files (upload validation,
  trash/restore, ZIP), error-shape consistency, **Part 2: classes + invitations
  (creation, expiry, revocation, usage limits, duplicate-membership prevention),
  permissions (member vs non-member vs owner, IDOR on every resource id, share/unshare
  revocation), chat (persistence, sender identity, replies, edit/delete authorization,
  cross-class isolation, size limits), attachments (allowed/rejected formats, size,
  membership-gated content/download, voice metadata)**, and an optional MySQL smoke
  test driven by `MYSQL_TEST_URL` (reported as *skipped* without it).
- **Frontend:** production build (`npm run build`) plus manual end-to-end verification of
  every flow against the running API (register → notes → categories → exports → settings →
  password change → deletion → logout; Part 2: create class → invite → second account
  joins → chat with replies/attachments → share/unshare → member removal → unread badge →
  presence).

---

## Known limitations (Part 2)

- **Single-instance realtime:** message delivery is authenticated 4-second polling and
  presence is a per-process in-memory heartbeat table (90 s TTL). This is correct for the
  documented single-instance deployment; running multiple workers/instances would need a
  shared message/presence store (e.g. Redis) — that infrastructure is intentionally **not**
  added yet, and multi-worker production support is not claimed.
- **Voice recording** requires a secure context (HTTPS or localhost) and microphone
  permission; unsupported browsers see an honest message instead of a dead button.
- Demo mode (no `VITE_API_URL`) has no class/chat features — they require the real API.

---

## Not included yet (Part 3)

- Cloud deployment (hosted API + database + static frontend)
- CI pipeline for the test suite

---

## Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Vite dev server (port 5173, proxies `/api`) |
| `npm run build`   | Production build to `dist/`       |
| `npm run preview` | Preview the production build (4173) |
| `backend/run.py`  | Flask dev server (port 5000)      |
| `flask db upgrade`| Apply database migrations         |
| `pytest`          | Backend test suite                |
