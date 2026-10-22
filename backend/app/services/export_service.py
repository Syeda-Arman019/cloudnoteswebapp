"""
Export service — dispatches a note to the right file builder.

Rules honoured here:
  * Ownership is validated by the route BEFORE this service is reached.
  * Files are generated in memory per request (never persisted server-side),
    and always from the latest database row.
  * Unsupported formats are rejected with a controlled 422.
  * Filenames are slugged from the note title; the header is additionally
    RFC 5987-encoded so Unicode titles download correctly.
"""

import io

from app.errors import ApiError
from app.services.docx_export import build_docx
from app.services.pdf_export import build_pdf
from app.utils import slugify_filename

EXPORT_FORMATS = {
    "pdf": {
        "label": "PDF document",
        "mime": "application/pdf",
        "extension": "pdf",
        "description": "Print-ready file, great for sharing and archiving.",
    },
    "docx": {
        "label": "Microsoft Word (.docx)",
        "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "extension": "docx",
        "description": "Editable document for Word, Docs, and LibreOffice.",
    },
    "txt": {
        "label": "Plain text (.txt)",
        "mime": "text/plain; charset=utf-8",
        "extension": "txt",
        "description": "Lightweight text file with no formatting.",
    },
    "md": {
        "label": "Markdown (.md)",
        "mime": "text/markdown; charset=utf-8",
        "extension": "md",
        "description": "Source-friendly format for repos and note apps.",
    },
}


def _fmt_dt(value):
    return value.strftime("%Y-%m-%d %H:%M UTC") if value else "—"


def _yaml_escape(text):
    return str(text).replace("\\", "\\\\").replace('"', '\\"')


def build_txt(note):
    """Plain-text rendering (UTF-8) with a metadata header."""
    lines = [
        note.title,
        "=" * max(len(note.title), 12),
        f"Category: {note.category.name if note.category else 'Uncategorized'}",
        f"Tags: {', '.join(tag.name for tag in note.tags) or '—'}",
        f"Created: {_fmt_dt(note.created_at)}",
        f"Last updated: {_fmt_dt(note.updated_at)}",
        "",
        note.content.strip(),
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def build_md(note):
    """
    Markdown rendering (UTF-8): YAML front matter with metadata, then an H1
    title and the original content untouched, so headings, lists, links, and
    inline formatting survive round-trips.
    """
    tags = ", ".join(f'"{_yaml_escape(tag.name)}"' for tag in note.tags)
    front_matter = "\n".join(
        [
            "---",
            f'title: "{_yaml_escape(note.title)}"',
            f'category: "{_yaml_escape(note.category.name if note.category else "Uncategorized")}"',
            f"tags: [{tags}]",
            f'created: "{_fmt_dt(note.created_at)}"',
            f'updated: "{_fmt_dt(note.updated_at)}"',
            f"pinned: {str(note.is_pinned).lower()}",
            "---",
            "",
        ]
    )
    body = f"# {note.title}\n\n{note.content.strip()}\n" if note.content.strip() else f"# {note.title}\n"
    return (front_matter + body).encode("utf-8")


def build_export(note, format_id):
    """
    Return (bytes, content_type, filename) for the requested format.

    Raises ApiError(422) for unsupported formats. Generation happens fully
    in memory and reflects the latest saved database content.
    """
    fmt = EXPORT_FORMATS.get(str(format_id or "").lower())
    if fmt is None:
        supported = ", ".join(sorted(EXPORT_FORMATS))
        raise ApiError(
            f"Unsupported export format. Choose one of: {supported}.",
            422,
            code="unsupported_format",
        )

    if format_id == "pdf":
        data = build_pdf(note)
    elif format_id == "docx":
        data = build_docx(note)
    elif format_id == "txt":
        data = build_txt(note)
    else:  # md
        data = build_md(note)

    filename = f"{slugify_filename(note.title)}.{fmt['extension']}"
    return data, fmt["mime"], filename


def build_export_stream(note, format_id):
    """In-memory file-like wrapper (used by tests and potential streaming)."""
    data, mime, filename = build_export(note, format_id)
    return io.BytesIO(data), mime, filename
