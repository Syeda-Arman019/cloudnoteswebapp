# Local development

CloudNotes runs as two processes in development: the Flask API and the Vite
dev server (which proxies `/api` to Flask so cookies stay same-origin).

```
Browser ──► Vite dev server :5173 ──/api──► Flask API :5000 ──► MySQL :3306
             (React + proxy)                  (REST + sessions)
```

---

## Prerequisites

| Tool          | Version                | Verified on   |
| ------------- | ---------------------- | ------------- |
| Node.js       | 18+                    | Node 24       |
| npm           | 9+                     | npm 11        |
| Python        | 3.11+                  | 3.13          |
| MySQL Server  | 8.0 (optional in dev — SQLite works for trying things out) | 8.0 |

---

## 1. Backend (Flask)

```bash
cd backend

# Create a virtual environment and install dependencies (first run only)
python -m venv .venv
.venv/Scripts/pip.exe install -r requirements.txt     # Windows
# python3 -m venv .venv && .venv/bin/pip install -r requirements.txt  # macOS/Linux

# Configure the environment (first run only)
cp .env.example .env
#   → set SECRET_KEY to a long random value
#   → set DATABASE_URL to your MySQL connection string (or SQLite to try it out)

# Create/apply the database schema
.venv/Scripts/flask.exe db upgrade

# Run the API → http://127.0.0.1:5000
.venv/Scripts/python.exe run.py
```

Quick check: `curl http://127.0.0.1:5000/api/health` →
`{"status":"ok","service":"cloudnotes-api","database":"up",…}`.

### MySQL (primary database)

```sql
CREATE DATABASE cloudnotes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- create a dedicated user and grant it privileges on `cloudnotes`
```

Then point `DATABASE_URL` at it (see `docs/database.md`):

```ini
DATABASE_URL=mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/cloudnotes?charset=utf8mb4
```

Run `flask db upgrade` again and restart the API. On MySQL the FK pragmas are
native, so nothing else changes.

> **Development on this machine:** MySQL 8.0 is installed as the `MySQL80`
> Windows service but listens on **port 3307** (not the default 3306) — the
> service's root password is required to create the database. Until it is
> supplied in `backend/.env`, local development runs on SQLite
> (`DATABASE_URL=sqlite:///cloudnotes-dev.db`); production still refuses to
> start without a real `DATABASE_URL`.

---

## 2. Frontend (React + Vite)

```bash
# From the repository root
npm install

# Configure the API target (first run only)
cp .env.example .env
#   → VITE_API_URL=/api   (uses the dev proxy — recommended)

npm run dev               # → http://localhost:5173
```

The dev server proxies `/api/*` to `http://127.0.0.1:5000`
(`vite.config.js`; override with `VITE_PROXY_TARGET` if the API runs
elsewhere). The session cookie is therefore same-origin in the browser — no
CORS or `Secure`-cookie friction.

With `VITE_API_URL` **unset in a development build only**, the app runs in
**demo mode** (isolated browser store, `demo@cloudnotes.app` / any password).
Demo mode never activates in production builds.

---

## 3. Running both

Terminal 1 (API):  `cd backend && .venv/Scripts/python.exe run.py`
Terminal 2 (web):  `npm run dev`

Open **http://localhost:5173**, register an account, and you are running the
full stack: registration seeds five default categories, sign-in sets the
session cookie, and note/export operations hit MySQL (or the dev SQLite file).

---

## 4. Tests and builds

```bash
# Backend test suite (62 tests + 1 MySQL smoke test that skips without MYSQL_TEST_URL)
cd backend
.venv/Scripts/python.exe -m pytest

# Frontend production build
npm run build            # → dist/
npm run preview          # serve the build → http://localhost:4173
```

`pytest` never touches your development database: it creates its own private
SQLite database per run (see `docs/database.md`).

---

## Ports

| Port | Process                          |
| ---- | -------------------------------- |
| 5173 | Vite dev server (frontend + `/api` proxy) |
| 5000 | Flask API                        |
| 4173 | `vite preview` (production bundle) |
| 3306 | MySQL (default; this machine: **3307**) |

---

## Troubleshooting

- **`proxy error` / 502 from the dev server** — the Flask API is not
  running; start `backend/run.py`.
- **401s on every API call after a while** — sessions last 168 h; password
  changes and account deletion invalidate them by design. Sign in again.
- **MySQL connection refused** — check the port (this machine: 3307), that
  the `MySQL80` service is running, and that `DATABASE_URL` credentials are
  correct.
- **Stale demo data visible** — demo mode and real mode use different
  storage; once `VITE_API_URL=/api`, old `localStorage` demo records are
  simply ignored. Clear site data if you want them gone.
- **Port already in use** — `netstat -ano | grep :5173` (or `:5000`) to find
  the holder, or run Vite with another port.
