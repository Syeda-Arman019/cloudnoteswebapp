"""Export endpoint: formats, headers, ownership, Unicode, edge cases."""

import io
import re
import zipfile

from tests.conftest import create_note, register_user

FORMATS = {
    "pdf": ("application/pdf", b"%PDF"),
    "docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b"PK",
    ),
    "txt": ("text/plain", None),
    "md": ("text/markdown", None),
}


def _unicode_note(client):
    return create_note(
        client,
        title="Café notes — Résumé & naïve plan ✅",
        content=(
            "# Überschrift\n\n"
            "Unicode body: héllo wörld — 中文字符, Кириллица, 🎉\n\n"
            "- élément un\n- élément deux\n\n"
            "> citation avec accents\n\n"
            "**gras** and *italique* with [a link](https://example.com/docs)\n"
        ),
        tags=["unicode", "café"],
    ).get_json()["note"]


def test_export_all_formats_round_trip(client):
    register_user(client)
    note = _unicode_note(client)

    for fmt, (mime, magic) in FORMATS.items():
        response = client.get(f"/api/notes/{note['id']}/export/{fmt}")
        assert response.status_code == 200, fmt
        assert response.mimetype == mime.split(";")[0]
        assert "attachment" in response.headers["Content-Disposition"]
        assert response.headers["Content-Disposition"].startswith("attachment;")

        data = response.data
        assert len(data) > 50, fmt
        if magic:
            assert data.startswith(magic), fmt


def test_pdf_content_and_pagination(client):
    register_user(client)
    long_body = "\n\n".join(f"## Section {i}\n\nParagraph {i} with unicode: café ✅\n" for i in range(1, 30))
    note = create_note(client, title="Long note", content=long_body).get_json()["note"]

    response = client.get(f"/api/notes/{note['id']}/export/pdf")
    assert response.status_code == 200
    data = response.data
    assert data.startswith(b"%PDF")
    # Multi-page document: several page objects for this much content.
    assert data.count(b"/Type /Page") >= 4
    assert "long-note.pdf" in response.headers["Content-Disposition"]


def test_docx_is_valid_openxml_zip(client):
    register_user(client)
    note = create_note(
        client,
        title="Word export",
        content="# Title one\n\nIntro paragraph.\n\n- item a\n- item b\n\n1. first\n2. second",
    ).get_json()["note"]

    response = client.get(f"/api/notes/{note['id']}/export/docx")
    assert response.status_code == 200

    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        names = archive.namelist()
        assert "word/document.xml" in names
        document_xml = archive.read("word/document.xml").decode("utf-8")
        assert "Word export" in document_xml
        assert "Intro paragraph." in document_xml


def test_txt_and_md_contents(client):
    register_user(client)
    categories = client.get("/api/categories").get_json()["categories"]
    study = next(c for c in categories if c["name"] == "Study")
    note = create_note(
        client,
        title="Plain export",
        content="# Heading\n\nBody text with **bold**.",
        categoryId=study["id"],
        tags=["alpha", "beta"],
    ).get_json()["note"]

    txt = client.get(f"/api/notes/{note['id']}/export/txt")
    assert txt.status_code == 200
    text = txt.data.decode("utf-8")
    assert "Plain export" in text
    assert "Category: Study" in text
    assert "Tags: alpha, beta" in text
    assert "Created:" in text and "Last updated:" in text
    assert "# Heading" in txt.data.decode("utf-8")

    md = client.get(f"/api/notes/{note['id']}/export/md")
    assert md.status_code == 200
    markdown = md.data.decode("utf-8")
    assert markdown.startswith("---")
    assert 'title: "Plain export"' in markdown
    assert 'category: "Study"' in markdown
    assert '"alpha", "beta"' in markdown
    assert "# Plain export" in markdown
    # Markdown content is preserved verbatim for round-tripping.
    assert "Body text with **bold**." in markdown


def test_unicode_survives_in_txt_and_md(client):
    register_user(client)
    note = _unicode_note(client)

    txt = client.get(f"/api/notes/{note['id']}/export/txt").data.decode("utf-8")
    assert "héllo wörld" in txt and "🎉" in txt and "Café notes" in txt

    md = client.get(f"/api/notes/{note['id']}/export/md").data.decode("utf-8")
    assert "中文字符" in md and "café" in md


def test_unicode_title_filename_is_safe(client):
    register_user(client)
    note = create_note(
        client, title='Q3 / Report: "final"? <draft> 🚀', content="body"
    ).get_json()["note"]

    response = client.get(f"/api/notes/{note['id']}/export/txt")
    disposition = response.headers["Content-Disposition"]
    assert "attachment" in disposition

    # Werkzeug may quote the filename or emit it bare; extract either form.
    match = re.search(r'filename=(?:"([^"]+)"|([^;]+))', disposition)
    assert match, disposition
    filename = (match.group(1) or match.group(2)).strip()
    assert "/" not in filename and "\\" not in filename
    assert filename.endswith(".txt")


def test_invalid_format_rejected(client):
    register_user(client)
    note = create_note(client).get_json()["note"]
    response = client.get(f"/api/notes/{note['id']}/export/xyz")
    assert response.status_code == 422
    assert response.get_json()["code"] == "unsupported_format"


def test_export_requires_ownership(client):
    register_user(client)
    note = create_note(client, title="Secret").get_json()["note"]

    client.post("/api/auth/logout")
    register_user(client)

    for fmt in FORMATS:
        response = client.get(f"/api/notes/{note['id']}/export/{fmt}")
        assert response.status_code == 404, fmt


def test_export_requires_authentication(client):
    register_user(client)
    note = create_note(client).get_json()["note"]
    client.post("/api/auth/logout")
    assert client.get(f"/api/notes/{note['id']}/export/pdf").status_code == 401


def test_export_missing_note_404(client):
    register_user(client)
    assert client.get("/api/notes/424242/export/pdf").status_code == 404


def test_export_uses_latest_saved_content(client):
    register_user(client)
    note = create_note(client, title="Before", content="version one").get_json()["note"]
    client.put(f"/api/notes/{note['id']}", json={"title": "After", "content": "version two"})

    txt = client.get(f"/api/notes/{note['id']}/export/txt").data.decode("utf-8")
    assert "After" in txt and "version two" in txt
    assert "version one" not in txt


def test_export_empty_content_note(client):
    register_user(client)
    # Simulate a legacy note with empty content directly through the service.
    note = create_note(client, title="Empty body", content="placeholder").get_json()["note"]
    from app.extensions import db
    from app.models import Note

    with client.application.app_context():
        db.session.get(Note, note["id"]).content = ""
        db.session.commit()

    txt = client.get(f"/api/notes/{note['id']}/export/txt")
    assert txt.status_code == 200
    assert "Empty body" in txt.data.decode("utf-8")

    pdf = client.get(f"/api/notes/{note['id']}/export/pdf")
    assert pdf.status_code == 200
    assert pdf.data.startswith(b"%PDF")


def test_export_large_note(client):
    register_user(client)
    big = "\n".join(f"Line {i} with some content — café ✅" for i in range(1, 800))
    note = create_note(client, title="Big note", content=big).get_json()["note"]
    if len(big) > 40000:
        # Content cap rejected it at creation; nothing to assert.
        return

    for fmt in ("pdf", "docx", "txt", "md"):
        response = client.get(f"/api/notes/{note['id']}/export/{fmt}")
        assert response.status_code == 200, fmt
        assert len(response.data) > 500, fmt
