# CloudNotes

**Your thoughts, organized anywhere.**

CloudNotes is a cloud-based notes and productivity platform for personal, study, work, and
project notes. This repository contains the **full stack**: a React frontend, a Flask REST
API with cookie-based authentication, a MySQL/SQLite database, real document exports, and an
automated test suite.

> **Project status — Part 2 of 3 (backend complete).**
> The Flask REST API, database schema + migrations, session authentication, real PDF/DOCX/TXT/
> Markdown exports, and the pytest suite (62 passing) are implemented and verified end to end
> against the running stack. **Part 3** (cloud deployment) is next.

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
cd backend && .venv/Scripts/python.exe -m pytest    # 62 passed, 1 MySQL smoke (skips w/o URL)
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
```

Notes: session cookie auth (`credentials: 'include'`), server-side validation with
`{ message, code, details }` errors, per-user scoping on every query (foreign resources
return the same 404 as missing ones), pagination (`per_page` ≤ 100), login rate limiting,
and an Origin check on mutating requests.

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
│   │   ├── models.py           # User, Category, Note, Tag, note_tags
│   │   ├── auth.py             # Session issue/validate, login_required
│   │   ├── validation.py       # Server-side validation (authoritative)
│   │   ├── errors.py           # ApiError + JSON error handlers
│   │   ├── rate_limit.py       # Sliding-window login limiter
│   │   ├── content.py          # Shared markdown-subset parser
│   │   ├── routes/             # auth, notes, categories, profile, exports
│   │   └── services/           # auth/notes/categories/profile services,
│   │                           # export dispatch + pdf/docx builders
│   ├── migrations/             # Flask-Migrate (initial schema)
│   ├── tests/                  # pytest suite (auth, notes, categories,
│   │                           # profile, exports, errors, MySQL smoke)
│   ├── requirements.txt / .env.example / run.py / wsgi.py / pytest.ini
└── src/                        # React frontend (see docs/ and services/)
    ├── components/ context/ hooks/ layouts/ pages/ services/ styles/ utils/
    ├── services/apiClient.js   # Central fetch client, cookie auth, demo detection
    └── services/mock/          # demo store (development only)
```

---

## Testing

- **Backend:** `pytest` — auth (registration, login, rate limits, sessions),
  notes CRUD + filtering + ownership, categories (defaults locked, detach-not-delete),
  profile (password change invalidates other sessions; deletion requires the password),
  all four export formats (binary magic checks), error-shape consistency, and an optional
  MySQL smoke test driven by `MYSQL_TEST_URL` (reported as *skipped* without it).
- **Frontend:** production build (`npm run build`) plus manual end-to-end verification of
  every flow against the running API (register → notes → categories → exports → settings →
  password change → deletion → logout).

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
