"""
PDF export built with ReportLab.

- Multi-page A4 document (page breaks happen automatically via Platypus).
- Unicode: a system TTF (Arial/DejaVu) is registered when available; the
  Helvetica fallback sanitizes text to Latin-1 so encoding never crashes.
- Content is XML-escaped before any markup is added, so note text is always
  rendered literally — never interpreted as executable markup. URLs are
  restricted to http(s)/mailto before being embedded as links.
"""

import os
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.content import parse_blocks, parse_inline

# Candidate font files: broad Unicode coverage when present on this machine.
_SANS_CANDIDATES = [
    # Windows
    ("Arial", r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
    # Linux
    (
        "DejaVuSans",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ),
    # macOS
    ("ArialMac", "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]
_MONO_CANDIDATES = [
    ("Consolas", r"C:\Windows\Fonts\consola.ttf"),
    ("DejaVuMono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
]

_FONT_CACHE = {}


def _register_fonts():
    """Register the first usable TTF pair; returns (regular, bold, mono) names."""
    if _FONT_CACHE:
        return _FONT_CACHE["names"]

    base, bold, mono = "Helvetica", "Helvetica-Bold", "Courier"
    for name, regular_path, bold_path in _SANS_CANDIDATES:
        if os.path.exists(regular_path) and os.path.exists(bold_path):
            try:
                pdfmetrics.registerFont(TTFont(name, regular_path))
                pdfmetrics.registerFont(TTFont(f"{name}-Bold", bold_path))
                pdfmetrics.registerFontFamily(
                    name, normal=name, bold=f"{name}-Bold", italic=name, boldItalic=f"{name}-Bold"
                )
                base, bold = name, f"{name}-Bold"
                break
            except Exception:  # pragma: no cover - unreadable/corrupt font file
                continue

    for name, path in _MONO_CANDIDATES:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                mono = name
                break
            except Exception:  # pragma: no cover
                continue

    _FONT_CACHE["names"] = (base, bold, mono)
    _FONT_CACHE["unicode"] = base != "Helvetica"
    return _FONT_CACHE["names"]


def _sanitize_for_fallback(text):
    """Helvetica covers Latin-1 only; replace anything unencodable."""
    if _FONT_CACHE.get("unicode", True):
        return text
    return text.encode("cp1252", "replace").decode("cp1252")


def _inline_markup(text, mono_face):
    """Convert parsed inline tokens to escaped ReportLab paragraph markup."""
    out = []
    for kind, value in parse_inline(text):
        if kind == "link":
            label, url = value
            out.append(f'<link href="{escape(url, {chr(34): "&quot;"})}">{escape(label)}</link>')
        elif kind == "strong":
            out.append(f"<b>{escape(value)}</b>")
        elif kind == "em":
            out.append(f"<i>{escape(value)}</i>")
        elif kind == "code":
            out.append(f'<font face="{mono_face}">{escape(value)}</font>')
        else:
            out.append(escape(value))
    return _sanitize_for_fallback("".join(out))


def _page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748f"))
    canvas.drawString(2 * cm, 1.2 * cm, "CloudNotes")
    canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(note, *, include_header=True):
    """Render a note to PDF bytes (title, metadata, content, page numbers)."""
    regular, bold, mono = _register_fonts()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title=note.title,
        author="CloudNotes",
    )

    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "CNBody", parent=styles["BodyText"], fontName=regular, fontSize=10.5, leading=15.5,
        spaceAfter=7, alignment=TA_LEFT, textColor=colors.HexColor("#22304a"),
    )
    heading_styles = {
        level: ParagraphStyle(
            f"CNH{level}", parent=styles["Heading1"], fontName=bold,
            fontSize=size, leading=size * 1.3, spaceBefore=12 - level, spaceAfter=6,
            textColor=colors.HexColor("#0b1a33"),
        )
        for level, size in ((1, 17), (2, 14), (3, 12), (4, 11))
    }
    title_style = ParagraphStyle(
        "CNTitle", parent=styles["Title"], fontName=bold, fontSize=22, leading=27,
        textColor=colors.HexColor("#0b1a33"), alignment=TA_LEFT, spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        "CNMeta", parent=body, fontSize=8.5, leading=12,
        textColor=colors.HexColor("#64748f"), spaceAfter=2,
    )
    quote_style = ParagraphStyle(
        "CNQuote", parent=body, fontName=regular, leftIndent=14, rightIndent=8,
        textColor=colors.HexColor("#64748f"), borderColor=colors.HexColor("#2563eb"),
        borderWidth=0, spaceBefore=2, spaceAfter=8,
    )
    bullet_style = ParagraphStyle("CNBullet", parent=body, leftIndent=16, bulletIndent=4, spaceAfter=3)

    story = []

    if include_header:
        story.append(Paragraph(escape(note.title), title_style))

        category_name = note.category.name if note.category else "Uncategorized"
        tag_text = ", ".join(tag.name for tag in note.tags) or "—"

        def _fmt_dt(value):
            return value.strftime("%Y-%m-%d %H:%M UTC") if value else "—"

        meta_rows = [
            ["Category", category_name],
            ["Tags", tag_text],
            ["Created", _fmt_dt(note.created_at)],
            ["Last updated", _fmt_dt(note.updated_at)],
        ]
        # Compact two-column metadata block with explicit widths.
        content_width = A4[0] - 4 * cm
        table_data = [
            [Paragraph(f"<b>{escape(k)}</b>", meta_style), Paragraph(escape(v), meta_style)]
            for k, v in meta_rows
        ]
        table = Table(table_data, colWidths=[2.6 * cm, content_width - 2.6 * cm])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 1),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                    ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#e2e9f4")),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 14))

    blocks = parse_blocks(note.content)
    if not blocks:
        story.append(Paragraph("<i>This note has no content.</i>", body))

    for block in blocks:
        if block["type"] == "heading":
            level = min(block["level"], 4)
            story.append(
                Paragraph(_inline_markup(block["text"], mono), heading_styles[level])
            )
        elif block["type"] == "list":
            items = [
                ListItem(Paragraph(_inline_markup(text, mono), bullet_style), leftIndent=16)
                for text in block["items"]
            ]
            story.append(
                ListFlowable(
                    items,
                    bulletType="1" if block["ordered"] else "bullet",
                    start="1",
                    bulletFontName=regular,
                    bulletFontSize=9.5,
                    leftIndent=18,
                    bulletDedent=12,
                    spaceAfter=6,
                )
            )
        elif block["type"] == "quote":
            story.append(Paragraph(f"<i>{_inline_markup(block['text'], mono)}</i>", quote_style))
        else:
            story.append(Paragraph(_inline_markup(block["text"], mono), body))

    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    data = buffer.getvalue()
    buffer.close()
    return data
