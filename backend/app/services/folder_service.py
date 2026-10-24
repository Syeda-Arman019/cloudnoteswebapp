"""
Folders service: the Study Library hierarchy (create, rename, move, list,
breadcrumbs, and safe deletion).

Rules:
  * Names are unique per (user, parent), case-insensitively — matching how
    categories behave.
  * Depth is bounded (FOLDER_MAX_DEPTH) so the tree stays practical.
  * A folder can never be moved into itself or one of its own descendants.
  * Deletion is SAFE: with `recursive=False` a non-empty folder is rejected
    with a 409 that reports what it contains; with `recursive=True` every
    file inside (at any depth) is moved to the Trash — recoverable — and
    empty subfolders are removed. Nothing valuable is ever destroyed
    silently.
"""

from sqlalchemy import func, select

from app.errors import ApiError
from app.extensions import db
from app.models import FOLDER_MAX_DEPTH, FOLDER_NAME_MAX, Folder, StudyFile, utcnow
from app.validation import validate_folder_name

NOT_FOUND = "Folder not found."


def _owned_folder(user, folder_id):
    folder = db.session.get(Folder, folder_id)
    if folder is None or folder.user_id != user.id:
        raise ApiError(NOT_FOUND, 404)
    return folder


def _siblings(user, parent_id, exclude_id=None):
    query = select(Folder).where(Folder.user_id == user.id, Folder.parent_id.is_(None) if parent_id is None else Folder.parent_id == parent_id)
    if exclude_id is not None:
        query = query.where(Folder.id != exclude_id)
    return db.session.scalars(query).all()


def _check_duplicate_name(user, parent_id, name, exclude_id=None):
    for sibling in _siblings(user, parent_id, exclude_id=exclude_id):
        if sibling.name.lower() == name.lower():
            raise ApiError(
                f'A folder named "{name}" already exists here.', 409,
                details={"field": "name"},
            )


def _depth_of(user, folder):
    """Depth of `folder` (root children = 1). Walks parents."""
    depth = 1
    current = folder
    seen = {folder.id}
    while current.parent_id is not None:
        parent = db.session.get(Folder, current.parent_id)
        if parent is None or parent.id in seen:
            break
        seen.add(parent.id)
        current = parent
        depth += 1
    return depth


def _subtree_ids(user, folder_id):
    """All folder ids in the subtree rooted at `folder_id` (inclusive)."""
    result = {folder_id}
    frontier = [folder_id]
    while frontier:
        rows = db.session.scalars(
            select(Folder.id).where(Folder.user_id == user.id, Folder.parent_id.in_(frontier))
        ).all()
        frontier = [row for row in rows if row not in result]
        result.update(frontier)
    return result


def _count_files(user, folder_ids, *, trashed=False):
    query = select(func.count(StudyFile.id)).where(
        StudyFile.user_id == user.id, StudyFile.folder_id.in_(folder_ids)
    )
    query = (
        query.where(StudyFile.deleted_at.isnot(None))
        if trashed
        else query.where(StudyFile.deleted_at.is_(None))
    )
    return db.session.scalar(query) or 0


def list_folders(user):
    """Flat list of the user's folders with per-folder counts (client builds the tree)."""
    folders = db.session.scalars(
        select(Folder).where(Folder.user_id == user.id).order_by(Folder.name)
    ).all()

    file_counts = dict(
        db.session.execute(
            select(StudyFile.folder_id, func.count(StudyFile.id))
            .where(StudyFile.user_id == user.id, StudyFile.deleted_at.is_(None))
            .group_by(StudyFile.folder_id)
        ).all()
    )
    child_counts = dict(
        db.session.execute(
            select(Folder.parent_id, func.count(Folder.id))
            .where(Folder.user_id == user.id)
            .group_by(Folder.parent_id)
        ).all()
    )

    return {
        "folders": [
            folder.serialize(
                file_count=file_counts.get(folder.id, 0),
                folder_count=child_counts.get(folder.id, 0),
            )
            for folder in folders
        ]
    }


def get_folder(user, folder_id):
    folder = _owned_folder(user, folder_id)
    return folder.serialize(
        file_count=_count_files(user, [folder.id]),
        folder_count=db.session.scalar(
            select(func.count(Folder.id)).where(
                Folder.user_id == user.id, Folder.parent_id == folder.id
            )
        )
        or 0,
    )


def create_folder(user, payload):
    data = validate_folder_name(payload or {})
    parent_id = data.get("parent_id")
    parent = None
    if parent_id is not None:
        parent = _owned_folder(user, parent_id)
        if _depth_of(user, parent) >= FOLDER_MAX_DEPTH:
            raise ApiError(
                f"Folders can be nested at most {FOLDER_MAX_DEPTH} levels deep.",
                422, details={"field": "parentId"},
            )
    _check_duplicate_name(user, parent_id, data["name"])
    folder = Folder(user_id=user.id, parent_id=parent_id, name=data["name"])
    db.session.add(folder)
    db.session.commit()
    return folder.serialize(file_count=0, folder_count=0)


def update_folder(user, folder_id, payload):
    folder = _owned_folder(user, folder_id)
    data = validate_folder_name(payload or {}, partial=True)
    if not data:
        raise ApiError("No valid fields to update.", 422)

    if "name" in data and data["name"] != folder.name:
        _check_duplicate_name(user, folder.parent_id, data["name"], exclude_id=folder.id)
        folder.name = data["name"]

    if "parent_id" in data and data["parent_id"] != folder.parent_id:
        new_parent_id = data["parent_id"]
        if new_parent_id is not None:
            new_parent = _owned_folder(user, new_parent_id)
            if new_parent.id == folder.id:
                raise ApiError("A folder cannot contain itself.", 422, details={"field": "parentId"})
            if new_parent.id in _subtree_ids(user, folder.id):
                raise ApiError(
                    "A folder cannot be moved inside one of its own subfolders.",
                    422, details={"field": "parentId"},
                )
            if _depth_of(user, new_parent) >= FOLDER_MAX_DEPTH:
                raise ApiError(
                    f"Folders can be nested at most {FOLDER_MAX_DEPTH} levels deep.",
                    422, details={"field": "parentId"},
                )
            _check_duplicate_name(user, new_parent_id, folder.name, exclude_id=folder.id)
        folder.parent_id = new_parent_id

    db.session.commit()
    return get_folder(user, folder.id)


def delete_folder(user, folder_id, *, recursive=False):
    """
    Delete a folder safely.

    * Empty folder → removed.
    * Non-empty + recursive=False → 409 with contents summary (the UI shows
      a confirmation listing what would be affected).
    * Non-empty + recursive=True → every active file in the subtree is moved
      to the Trash (recoverable), trashed files are purged-from-folder
      association, and all subfolder rows are deleted.
    """
    folder = _owned_folder(user, folder_id)
    subtree = _subtree_ids(user, folder.id)
    active_files = _count_files(user, subtree)
    subfolders = len(subtree) - 1

    if (active_files or subfolders) and not recursive:
        raise ApiError(
            "This folder is not empty.", 409,
            details={
                "code": "folder_not_empty",
                "fileCount": active_files,
                "subfolderCount": subfolders,
            },
        )

    if active_files:
        now = utcnow()
        db.session.execute(
            StudyFile.__table__.update()
            .where(
                StudyFile.user_id == user.id,
                StudyFile.folder_id.in_(subtree),
                StudyFile.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )

    # Remove subfolders deepest-first; the DB would re-parent children to the
    # root on parent deletion, so ordering keeps the tree consistent.
    folder_rows = db.session.scalars(
        select(Folder).where(Folder.user_id == user.id, Folder.id.in_(subtree))
    ).all()
    for row in sorted(folder_rows, key=lambda f: -_depth_of(user, f)):
        db.session.delete(row)
    db.session.commit()
    return {"deleted": True, "trashedFiles": active_files, "removedFolders": len(folder_rows)}


def breadcrumbs(user, folder_id):
    """Ancestor chain from the root down to (and including) `folder_id`."""
    chain = []
    current_id = folder_id
    seen = set()
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        folder = db.session.get(Folder, current_id)
        if folder is None or folder.user_id != user.id:
            break
        chain.append({"id": folder.id, "name": folder.name, "parentId": folder.parent_id})
        current_id = folder.parent_id
    chain.reverse()
    return {"breadcrumbs": chain}
