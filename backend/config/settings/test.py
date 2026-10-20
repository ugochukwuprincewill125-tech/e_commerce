"""Test settings — uses SQLite in-memory and disables throttling."""
from .dev import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = ()  # noqa: F405
REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] = (  # noqa: F405
    "apps.users.authentication.VerifiedEmailJWTAuthentication",
    "rest_framework.authentication.SessionAuthentication",
)

# The test suite must never call Brevo or a real SMTP server, even if a
# developer has a live BREVO_API_KEY in backend/.env.
BREVO_API_KEY = ""  # noqa: F405
BREVO_SENDER_NAME = "Timeline Gadgets Test"  # noqa: F405
BREVO_SENDER_EMAIL = "test@example.com"  # noqa: F405
BREVO_REPLY_TO_EMAIL = "test@example.com"  # noqa: F405
EMAIL_TEST_MODE = False  # noqa: F405
EMAIL_TEST_RECIPIENT = ""  # noqa: F405
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"  # noqa: F405
EMAIL_REQUIRE_REAL_PROVIDER = False  # noqa: F405
EMAIL_MAX_ATTEMPTS = 3  # noqa: F405
EMAIL_IMMEDIATE_ATTEMPTS = 1  # noqa: F405
EMAIL_RETRY_AFTER_MINUTES = 1  # noqa: F405
