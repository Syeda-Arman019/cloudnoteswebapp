"""Blueprint registration."""

from app.routes.auth import bp as auth_bp
from app.routes.categories import bp as categories_bp
from app.routes.exports import bp as exports_bp
from app.routes.notes import bp as notes_bp
from app.routes.profile import bp as profile_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(notes_bp, url_prefix="/api")
    app.register_blueprint(categories_bp, url_prefix="/api")
    app.register_blueprint(profile_bp, url_prefix="/api/profile")
    app.register_blueprint(exports_bp, url_prefix="/api")
