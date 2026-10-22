"""Production/WSGI entry point: `gunicorn wsgi:app` (Part 3) or any WSGI server."""

from app import create_app

app = create_app()

if __name__ == "__main__":  # pragma: no cover - convenience run
    app.run(host="127.0.0.1", port=5000)
