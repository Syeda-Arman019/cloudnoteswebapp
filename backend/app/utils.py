"""Small shared helpers."""

import re
import unicodedata


def json_response(data, status=200):
    from flask import jsonify

    response = jsonify(data)
    response.status_code = status
    return response


def slugify_filename(title, max_length=60):
    """
    Build a filesystem-safe slug from a note title.

    Unicode letters are preserved (NFKD-normalized) so exported files keep
    meaningful names; everything else becomes '-'. Used only inside the
    Content-Disposition header (which is additionally RFC 5987 encoded), so
    no path separators or control characters can ever appear.
    """
    text = (title or "note").strip()
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii") or "note"
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return (text[:max_length].strip("-") or "note")
