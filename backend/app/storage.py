"""
Private storage for uploaded study files.

Design:
  * Files live under `backend/uploads/` — OUTSIDE any static directory, so
    nothing is ever served without an authenticated, ownership-checked
    download route.
  * On-disk names are server-generated (uuid4 + extension). Client names are
    metadata only, so path traversal is structurally impossible.
  * The public surface is a tiny store interface (save/open/delete/exists),
    making a future move to S3/R2 a drop-in replacement of this module.

The directory is configurable via UPLOAD_FOLDER (set in config.py) so tests
can point at a temporary location.
"""

import re
import uuid
from pathlib import Path

from flask import current_app

# Conservative characters for on-disk names; everything else is stripped.
_SAFE_STEM = re.compile(r"[^A-Za-z0-9._-]+")


def _upload_root() -> Path:
    root = Path(current_app.config["UPLOAD_FOLDER"])
    root.mkdir(parents=True, exist_ok=True)
    return root


def new_stored_name(original_name: str) -> str:
    """Generate a unique, traversal-proof on-disk filename for an upload."""
    suffix = Path(original_name).suffix.lower()
    suffix = _SAFE_STEM.sub("", suffix)[:16]
    return f"{uuid.uuid4().hex}{suffix}"


def save_stream(stored_name: str, fileobj, *, max_bytes: int) -> int:
    """
    Stream `fileobj` to disk under `stored_name`, enforcing a hard size cap.

    Returns the number of bytes written. Raises SizeLimitError (and removes
    the partial file) when the stream exceeds `max_bytes` — the size is
    enforced while streaming, so an oversized upload is never fully buffered.
    """
    destination = _upload_root() / stored_name
    written = 0
    try:
        with destination.open("wb") as handle:
            while True:
                chunk = fileobj.read(64 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise SizeLimitError(
                        f"File exceeds the {max_bytes // (1024 * 1024)} MB limit."
                    )
                handle.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return written


def open_for_read(stored_name: str):
    """Open a stored file for binary reading (ownership is checked by callers)."""
    path = _upload_root() / stored_name
    if not path.is_file():
        raise FileNotFoundError(stored_name)
    return path.open("rb")


def file_path(stored_name: str) -> Path:
    """Absolute path of a stored file (for send_file-style streaming)."""
    return _upload_root() / stored_name


def exists(stored_name: str) -> bool:
    return (_upload_root() / stored_name).is_file()


def delete(stored_name: str) -> bool:
    """Remove stored bytes; missing files count as success (idempotent)."""
    (_upload_root() / stored_name).unlink(missing_ok=True)
    return True


class SizeLimitError(Exception):
    """Raised when an upload exceeds the configured maximum size."""
