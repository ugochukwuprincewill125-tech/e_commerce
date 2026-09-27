"""Production settings. Use with DJANGO_SETTINGS_MODULE=config.settings.prod."""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import env_bool

DEBUG = False

if not SECRET_KEY or SECRET_KEY.startswith("dev-only"):  # noqa: F405
    raise ImproperlyConfigured("SECRET_KEY must be set to a strong random value in production.")

# Never allow simulated payments in production.
PAYMENT_TEST_MODE = False
if not PAYSTACK_SECRET_KEY:  # noqa: F405
    raise ImproperlyConfigured("PAYSTACK_SECRET_KEY must be set in production.")

# Product photos must live in Backblaze B2 in production — the local
# filesystem disappears between deploys and is not shared across replicas.
if not (B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY and B2_BUCKET_NAME and B2_ENDPOINT_URL):  # noqa: F405
    raise ImproperlyConfigured(
        "Backblaze B2 is required in production: set B2_APPLICATION_KEY_ID, "
        "B2_APPLICATION_KEY, B2_BUCKET_NAME and B2_ENDPOINT_URL."
    )

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SECURE_HSTS_SECONDS = int(__import__("os").getenv("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# Serve collected static files (admin CSS/JS) efficiently with WhiteNoise.
# Media storage comes from base settings (Backblaze B2) and is not overridden.
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STORAGES["staticfiles"] = {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"}  # noqa: F405

REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = ("rest_framework.renderers.JSONRenderer",)  # noqa: F405
