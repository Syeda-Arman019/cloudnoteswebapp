"""
Shared parser for the note-content markdown subset.

Notes are stored as plain text using the same subset the frontend supports:

    # Heading 1 … #### Heading 4
    - bullet items   /  1. ordered items
    > blockquote
    **bold**, *italic*, `code`, [text](https://url)

Exporters (PDF, DOCX, TXT, MD) consume these blocks; TXT/Markdown pass the
original text through untouched so formatting survives round-trips.
"""

import re

HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")
BULLET_RE = re.compile(r"^\s*[-*+]\s+(.*)$")
ORDERED_RE = re.compile(r"^\s*\d+[.)]\s+(.*)$")
QUOTE_RE = re.compile(r"^\s*>\s?(.*)$")

INLINE_RE = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))")
LINK_RE = re.compile(r"^\[([^\]]+)\]\(([^)\s]+)\)$")

SAFE_URL_RE = re.compile(r"^(https?://|mailto:|#|/)", re.IGNORECASE)


def parse_blocks(content):
    """Parse content into [{"type": heading|list|quote|paragraph, ...}]."""
    blocks = []
    paragraph, current_list = [], None

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            blocks.append({"type": "paragraph", "text": " ".join(paragraph)})
            paragraph = []

    def flush_list():
        nonlocal current_list
        if current_list:
            blocks.append(current_list)
            current_list = None

    for raw_line in str(content or "").replace("\r\n", "\n").split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            flush_paragraph()
            flush_list()
            continue

        heading = HEADING_RE.match(line)
        if heading:
            flush_paragraph()
            flush_list()
            blocks.append(
                {"type": "heading", "level": len(heading.group(1)), "text": heading.group(2).strip()}
            )
            continue

        bullet = BULLET_RE.match(line)
        if bullet:
            flush_paragraph()
            if not current_list or current_list["ordered"]:
                flush_list()
                current_list = {"type": "list", "ordered": False, "items": []}
            current_list["items"].append(bullet.group(1).strip())
            continue

        ordered = ORDERED_RE.match(line)
        if ordered:
            flush_paragraph()
            if not current_list or not current_list["ordered"]:
                flush_list()
                current_list = {"type": "list", "ordered": True, "items": []}
            current_list["items"].append(ordered.group(1).strip())
            continue

        quote = QUOTE_RE.match(line)
        if quote:
            flush_paragraph()
            flush_list()
            blocks.append({"type": "quote", "text": quote.group(1).strip()})
            continue

        flush_list()
        paragraph.append(line.strip())

    flush_paragraph()
    flush_list()
    return blocks


def parse_inline(text):
    """
    Split inline markdown into tokens:
    [("text", value), ("strong", value), ("em", value), ("code", value),
     ("link", (label, url))]
    Unsafe URLs degrade to plain text instead of becoming clickable.
    """
    tokens = []
    for part in INLINE_RE.split(str(text or "")):
        if not part:
            continue
        link = LINK_RE.match(part)
        if link:
            label, url = link.group(1), link.group(2)
            tokens.append(("link", (label, url)) if SAFE_URL_RE.match(url) else ("text", label))
        elif part.startswith("**") and part.endswith("**") and len(part) > 4:
            tokens.append(("strong", part[2:-2]))
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            tokens.append(("em", part[1:-1]))
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            tokens.append(("code", part[1:-1]))
        else:
            tokens.append(("text", part))
    return tokens


def plain_text(text):
    """Flatten inline markdown to plain text (used by TXT)."""
    out = []
    for kind, value in parse_inline(text):
        if kind == "link":
            out.append(f"{value[0]} ({value[1]})")
        else:
            out.append(value)
    return "".join(out)
