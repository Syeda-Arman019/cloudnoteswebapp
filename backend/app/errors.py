"""
Consistent JSON error handling.

Every error response has the shape {"message": "..."} (plus optional "code"),
which the frontend API client surfaces through the notification system.
Stack traces and secrets are logged server-side, never returned.
"""

import logging

from flask import jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger("cloudnotes")


class ApiError(Exception):
    """Raised by services/routes to produce a controlled JSON error."""

    def __init__(self, message, status=400, code=None, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code or _default_code(status)
        self.details = details

    def to_dict(self):
        payload = {"message": self.message, "code": self.code}
        if self.details:
            payload["details"] = self.details
        return payload


def _default_code(status):
    return {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        413: "payload_too_large",
        422: "invalid_input",
        429: "rate_limited",
        500: "server_error",
    }.get(status, "error")


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(error):
        return jsonify(error.to_dict()), error.status

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        # Do not leak Werkzeug's default debug pages in JSON mode.
        message = error.description or error.name
        if app.config.get("DEBUG") is not True:
            message = {
                400: "Invalid request.",
                401: "You must be signed in to do that.",
                403: "You do not have permission to do that.",
                404: "The requested resource was not found.",
                405: "That method is not allowed here.",
                409: "The request conflicts with the current state.",
                413: "The request payload is too large.",
                429: "Too many attempts. Please wait and try again.",
            }.get(error.code, "Request failed.")
        return jsonify({"message": message, "code": _default_code(error.code or 500)}), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):  # noqa: ANN001 - Flask passes any exception
        if isinstance(error, ApiError):
            return jsonify(error.to_dict()), error.status
        # Unexpected failures are logged with a traceback but never returned.
        logger.exception("Unhandled server error: %s", error)
        return jsonify({"message": "An unexpected server error occurred.", "code": "server_error"}), 500
