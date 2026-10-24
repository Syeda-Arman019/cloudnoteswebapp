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
users 1 ──* folders *──1 folders    (self-referencing hierarchy)
users 1 ──* study_files *──1 folders

# Part 2 — class collaboration
users 1 ──* study_classes          (owner_id; deleting a user removes their classes)
users 1 ──* class_memberships *──1 study_classes
users 1 ──* class_invitations      (created_by)
users 1 ──* chat_messages          (sender_id)
chat_messages 1 ──* chat_messages  (reply_to_id, ON DELETE SET NULL → tombstones survive)
chat_messages 1 ──* chat_messages  (attachments, ON DELETE CASCADE)
study_classes 1 ──* chat_*         (class_id; deleting a class removes its chat)
notes/folders/study_files *──? study_classes  (shared_class_id, ON DELETE SET NULL
                                               → sharing reverts to private, never public)
```

---

## Part 2 schema (classes, invitations, sharing, chat)

Added by migration `436d22b6c72b_classes_memberships_invitations_chat_…`
(additive only — existing users, notes, categories, tags, folders and files
are untouched; verified by row counts before/after).

### `study_classes`

| Column | Notes |
| ------ | ----- |
| `id`, `owner_id` (FK users, CASCADE), `name` (≤120), `description` (≤400, default `""`) | |
| `created_at`, `updated_at` | UTC, `onupdate` on edit |

### `class_memberships`

| Column | Notes |
| ------ | ----- |
| `class_id` (FK, CASCADE), `user_id` (FK, CASCADE) | **`UNIQUE (class_id, user_id)`** — duplicate active memberships are impossible even under concurrent joins |
| `role` | `owner` \| `member` |
| `last_read_at` | nullable; drives unread counts |
| `joined_at` | |

Indexes: `user_id`, `(class_id, role)`.

### `class_invitations`

| Column | Notes |
| ------ | ----- |
| `class_id` (FK, CASCADE), `created_by` (FK users, CASCADE) | |
| `token_hash` | **SHA-256 of the raw token only** — the raw token exists solely in the one-time creation response |
| `expires_at` | nullable (`NULL` = no expiry; 1 h–90 d enforced) |
| `max_uses`, `use_count` | `max_uses NULL` = unlimited; status = active/expired/revoked/exhausted derived, never stored |
| `revoked_at`, `created_at` | |

Indexes: `token_hash`, `class_id`. The raw token or hash never appears in any
API response after creation.

### `chat_messages`

| Column | Notes |
| ------ | ----- |
| `class_id` (FK, CASCADE), `sender_id` (FK users, CASCADE) | sender always from the session |
| `reply_to_id` (FK self, **SET NULL**) | replies survive deletion of the target |
| `content` (Text, default `""`), `is_deleted` (Boolean) | delete = tombstone: content cleared, row kept so replies/threads stay valid |
| `edited_at`, `created_at`, `updated_at` | |

Indexes: `(class_id, created_at)` (pagination), `sender_id`, `reply_to_id`.

### `chat_attachments`

| Column | Notes |
| ------ | ----- |
| `message_id` (FK, nullable, CASCADE) | `NULL` while pending upload; claimed by the message POST (validates class + uploader) |
| `class_id` (FK, CASCADE) | **denormalized** so an attachment id from one class can never be served to another |
| `uploader_id` (FK users, CASCADE) | |
| `original_name` (≤255, sanitized metadata), `stored_name` (unique, random) | bytes live in the private `UPLOAD_FOLDER`, never a public static dir |
| `mime_type`, `size_bytes`, `kind` | `kind` = `image` \| `document` \| `audio` |
| `created_at` | |

Indexes: `message_id`, `class_id`, `(message_id, created_at)` (orphan cleanup).

### Sharing columns on existing tables

`notes.shared_class_id`, `folders.shared_class_id`, `study_files.shared_class_id`
— nullable FK → `study_classes.id` with **ON DELETE SET NULL**: deleting a class
reverts shared resources to *private*, never public, and never deletes the
owner's personal data.

---

## Migrations

[Flask-Migrate](https://flask-migrate.readthedocs.io/) (Alembic) is wired into
the app factory. Migrations so far:

1. `7b34f7726b72_initial_schema…` — users, categories, notes, tags, note_tags.
2. `c9d4e2a71f05_study_library_folders_study_files…` — folders + files.
3. `d8b3f60c92a4_notes_optional_folder_link…` — notes → folder link.
4. `436d22b6c72b_classes_memberships_invitations_chat_…` — Part 2 (above).

**Never reset the database to apply a migration** — run `flask db upgrade`;
all Part 2 migrations are additive (new tables/columns only).

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
