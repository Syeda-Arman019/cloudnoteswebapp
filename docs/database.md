# CloudNotes database

**Primary database: MySQL 8.0** (PyMySQL driver). SQLite is used only for the
automated test suite and as a zero-setup development fallback — production
requires MySQL and the app factory refuses to boot without a `DATABASE_URL`.

Connection settings come exclusively from the `DATABASE_URL` environment
variable (see `backend/.env.example`):

```ini
# MySQL (primary)
DATABASE_URL=mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/cloudnotes?charset=utf8mb4

# Tests (pytest overrides this with a private temporary database)
TEST_DATABASE_URL=sqlite:///cloudnotes-tests.db
```

Driver notes: PyMySQL needs the `cryptography` package for MySQL 8's
`caching_sha2_password` authentication (pinned in `requirements.txt`), and
engine options enable `pool_pre_ping` + `pool_recycle` so long-idle dev
connections survive MySQL's `wait_timeout`.

---

## Schema

Five tables. Timestamps are naive UTC, serialized with a trailing `Z`.
Every user-owned row cascades from its owner.

### `users`

| Column            | Type           | Constraints                    |
| ----------------- | -------------- | ------------------------------ |
| `id`              | INTEGER        | PK                             |
| `full_name`       | VARCHAR(120)   | NOT NULL                       |
| `email`           | VARCHAR(255)   | NOT NULL, UNIQUE, indexed      |
| `password_hash`   | VARCHAR(255)   | NOT NULL (Werkzeug pbkdf2/scrypt) |
| `role`            | VARCHAR(32)    | NOT NULL, default `member`     |
| `session_version` | INTEGER        | NOT NULL, default `1`          |
| `created_at`      | DATETIME       | NOT NULL                       |
| `updated_at`      | DATETIME       | NOT NULL, auto-updated         |

`session_version` is the session-invalidation counter: it is stored inside the
signed cookie, so bumping it (password change, account deletion, logout-all)
invalidates every outstanding cookie **without keeping a token table**.

### `categories`

| Column        | Type         | Constraints                          |
| ------------- | ------------ | ------------------------------------ |
| `id`          | INTEGER      | PK                                   |
| `user_id`     | INTEGER      | FK → `users.id` ON DELETE CASCADE, indexed |
| `name`        | VARCHAR(40)  | NOT NULL                             |
| `description` | VARCHAR(160) | NOT NULL, default `''`               |
| `color`       | VARCHAR(20)  | NOT NULL, default `default`          |
| `is_default`  | BOOLEAN      | NOT NULL, default `false`            |
| `created_at`  | DATETIME     | NOT NULL                             |
| `updated_at`  | DATETIME     | NOT NULL, auto-updated               |

- `UNIQUE (user_id, name)` — `uq_categories_user_name` (one category name per
  account; case-insensitive duplicates are also rejected in the service layer).
- Index `ix_categories_user_name (user_id, name)` supports the per-user,
  name-ordered list.
- Deleting a category sets its notes' `category_id` to NULL — **notes are
  never deleted with a category** (service layer + `ON DELETE SET NULL`).

### `notes`

| Column        | Type         | Constraints                          |
| ------------- | ------------ | ------------------------------------ |
| `id`          | INTEGER      | PK                                   |
| `user_id`     | INTEGER      | FK → `users.id` ON DELETE CASCADE, indexed |
| `category_id` | INTEGER      | FK → `categories.id` ON DELETE **SET NULL**, nullable, indexed |
| `title`       | VARCHAR(120) | NOT NULL                             |
| `content`     | TEXT         | NOT NULL, default `''`               |
| `is_pinned`   | BOOLEAN      | NOT NULL, default `false`            |
| `created_at`  | DATETIME     | NOT NULL                             |
| `updated_at`  | DATETIME     | NOT NULL, auto-updated               |

Composite indexes for the hot user-scoped lookups:

- `ix_notes_user_updated (user_id, updated_at)` — dashboard "recently updated"
- `ix_notes_user_created (user_id, created_at)` — oldest/newest sorts
- `ix_notes_user_pinned (user_id, is_pinned)` — pinned filter
- `ix_notes_user_category (user_id, category_id)` — per-category lists

### `tags`

| Column      | Type        | Constraints                     |
| ----------- | ----------- | ------------------------------- |
| `id`        | INTEGER     | PK                              |
| `user_id`   | INTEGER     | FK → `users.id` ON DELETE CASCADE, indexed |
| `name`      | VARCHAR(24) | NOT NULL                        |
| `created_at`| DATETIME    | NOT NULL                        |

- `UNIQUE (user_id, name)` — `uq_tags_user_name` (tag vocabulary is
  per-account).

### `note_tags` (association)

| Column    | Type    | Constraints                        |
| --------- | ------- | ---------------------------------- |
| `note_id` | INTEGER | FK → `notes.id` ON DELETE CASCADE, PK part |
| `tag_id`  | INTEGER | FK → `tags.id` ON DELETE CASCADE, PK part  |

Many-to-many between notes and tags; junction rows are managed by SQLAlchemy
when a note's `tags` collection is replaced.

### Relationships at a glance

```
users 1 ──* notes *──1 categories
users 1 ──* categories
users 1 ──* tags * ──* notes        (via note_tags)
```

---

## Migrations

[Flask-Migrate](https://flask-migrate.readthedocs.io/) (Alembic) is wired into
the app factory. The initial migration `7b34f7726b72_initial_schema…`
creates the full schema above.

```bash
cd backend
.venv/Scripts/flask.exe db upgrade    # apply migrations (SQLite or MySQL)
.venv/Scripts/flask.exe db migrate -m "Describe your change"   # autogenerate
.venv/Scripts/flask.exe db revision   # hand-written migration
.venv/Scripts/flask.exe db history    # revision chain
```

Alembic reads `DATABASE_URL` from `backend/.env`, so the same commands work
against development MySQL and the SQLite dev/test database. For a brand-new
MySQL database, create it first (see `docs/local-development.md`), then run
`flask db upgrade`.

A development-only shortcut also exists: `flask create-tables` runs
`db.create_all()` (useful for a fresh SQLite file, but **use migrations** for
anything shared).

---

## Test isolation

`pytest` selects `TestingConfig`: a private temporary SQLite database
(`TEST_DATABASE_URL`, falling back to `cloudnotes-tests.db`), SQLite foreign
keys enforced through a connection pragma, relaxed rate limits, and no
production settings. SQLite is **never** used in production — the factory
raises if `DATABASE_URL` is missing when running in production mode.

`backend/tests/test_mysql_smoke.py` additionally exercises the real MySQL
driver when `MYSQL_TEST_URL` is provided:

```bash
MYSQL_TEST_URL="mysql+pymysql://user:pass@127.0.0.1:3307/cloudnotes_test" \
  .venv/Scripts/python.exe -m pytest tests/test_mysql_smoke.py -v
```

Without that variable the smoke test is reported as **skipped**, never as a
pass.
