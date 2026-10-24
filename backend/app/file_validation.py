"""
Upload validation: allowed formats, size limits, and content signatures.

Security posture:
  * The browser-supplied MIME type is NEVER trusted. Every upload must carry
    an allowed extension AND matching magic bytes (content signature).
  * Filenames from clients are sanitized to a display-safe basename; they are
    never used as on-disk paths (see storage.py).
  * Uploaded bytes are never executed, never served as text/html, and are
    only streamed back through authenticated routes with safe content types.
"""

from app.errors import ApiError

# Extension -> (human label, canonical MIME type, magic-byte checks).
# A magic check is (offset, bytes) that must match the file head.
# Office OOXML (.docx/.xlsx/.pptx) and .zip-like containers match "PK".
_ALLOWED = {
    "pdf": (
        "PDF document",
        "application/pdf",
        ((0, b"%PDF-"),),
    ),
    "doc": (
        "Microsoft Word document",
        "application/msword",
        ((0, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),),  # OLE2 compound file
    ),
    "docx": (
        "Microsoft Word document",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ((0, b"PK\x03\x04"),),
    ),
    "ppt": (
        "Microsoft PowerPoint presentation",
        "application/vnd.ms-powerpoint",
        ((0, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),),
    ),
    "pptx": (
        "Microsoft PowerPoint presentation",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ((0, b"PK\x03\x04"),),
    ),
    "xls": (
        "Microsoft Excel spreadsheet",
        "application/vnd.ms-excel",
        ((0, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),),
    ),
    "xlsx": (
        "Microsoft Excel spreadsheet",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ((0, b"PK\x03\x04"),),
    ),
    "txt": (
        "Plain text file",
        "text/plain",
        (),  # no signature: validated as decodable text below
    ),
    "md": (
        "Markdown file",
        "text/markdown",
        (),
    ),
    "png": (
        "PNG image",
        "image/png",
        ((0, b"\x89PNG\r\n\x1a\n"),),
    ),
    "jpg": (
        "JPEG image",
        "image/jpeg",
        ((0, b"\xff\xd8\xff"),),
    ),
    "jpeg": (
        "JPEG image",
        "image/jpeg",
        ((0, b"\xff\xd8\xff"),),
    ),
    "webp": (
        "WebP image",
        "image/webp",
        ((0, b"RIFF"), (8, b"WEBP")),
    ),
}

ALLOWED_EXTENSIONS = frozenset(_ALLOWED)

# Formats the UI can preview in-app (served inline with a safe content type).
PREVIEWABLE_MIME_TYPES = frozenset(
    {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
        "text/markdown",
    }
)

MAX_FILENAME_LEN = 255

# Size limit is applied by config (MAX_UPLOAD_MB); this module only enforces.


def extension_of(filename: str) -> str:
    """Lowercased extension without the dot ('' when there is none)."""
    name = str(filename or "")
    if "." not in name:
        return ""
    return name.rsplit(".", 1)[1].lower()


def sanitize_filename(filename: str) -> str:
    """
    Reduce a client-supplied path to a safe display basename.

    Strips directory components (both separators), control characters, and
    leading dots; collapses whitespace; enforces a length cap. The result is
    metadata only — never a filesystem path.
    """
    import re

    name = str(filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if ch.isprintable())
    name = re.sub(r"\s+", " ", name).strip().lstrip(".")
    if not name:
        raise ApiError("A filename is required.", 422, details={"field": "file"})
    if len(name) > MAX_FILENAME_LEN:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) <= 12:
            keep = MAX_FILENAME_LEN - len(ext) - 1
            name = f"{stem[:keep]}.{ext}"
        else:
            name = name[:MAX_FILENAME_LEN]
    return name


def validate_extension(filename: str) -> str:
    """Return the validated extension or raise a 422 with a helpful message."""
    ext = extension_of(filename)
    if not ext:
        raise ApiError(
            "Files must include an extension (for example .pdf or .docx).",
            422,
            details={"field": "file"},
        )
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ApiError(
            f"Unsupported file type '.{ext}'. Allowed types: {allowed}.",
            422,
            details={"field": "file"},
        )
    return ext


def validate_signature(ext: str, head: bytes) -> None:
    """
    Verify content signatures (magic bytes) for the given extension.

    `head` is the first chunk of the file (4 KiB is plenty). txt/md have no
    universal magic number, so they must decode as UTF-8 text and contain no
    NUL bytes — which rejects binaries masquerading with a .txt extension.
    """
    label, _mime, checks = _ALLOWED[ext]

    if not checks:  # text formats
        if b"\x00" in head:
            raise ApiError(
                f"'{ext}' files must contain plain text, but this file looks binary.",
                422,
                details={"field": "file"},
            )
        try:
            head.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ApiError(
                f"'{ext}' files must be valid UTF-8 text.",
                422,
                details={"field": "file"},
            ) from exc
        return

    for offset, expected in checks:
        if head[offset : offset + len(expected)] != expected:
            raise ApiError(
                f"This file does not look like a valid {label} "
                f"(content check failed for '.{ext}').",
                422,
                details={"field": "file"},
            )


def mime_for(ext: str) -> str:
    """Canonical MIME type for a validated extension."""
    return _ALLOWED[ext][1]


def label_for(ext: str) -> str:
    """Human label for a validated extension."""
    return _ALLOWED.get(ext, ("File", "application/octet-stream", ()))[0]


def is_previewable(mime_type: str) -> bool:
    return mime_type in PREVIEWABLE_MIME_TYPES


def format_size(num_bytes: int) -> str:
    """1536 -> '1.5 KB' (used in error messages and API payloads)."""
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            if unit == "B":
                return f"{int(size)} B"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"  # pragma: no cover - unreachable
