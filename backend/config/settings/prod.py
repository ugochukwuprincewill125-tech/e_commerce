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

# Product photos live in Cloudinary in production — the local filesystem
# disappears between deploys and is not shared across replicas.
if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):  # noqa: F405
    raise ImproperlyConfigured(
        "Cloudinary is required in production: set CLOUDINARY_CLOUD_NAME, "
        "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    )

if not FRONTEND_URL or FRONTEND_URL.startswith("http://localhost"):  # noqa: F405
    raise ImproperlyConfigured("FRONTEND_URL must be set to the public https site URL in production.")

if ALLOWED_HOSTS == ["localhost", "127.0.0.1"]:  # noqa: F405
    raise ImproperlyConfigured("ALLOWED_HOSTS must list the production domain(s).")

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
# Media storage comes from base settings (Cloudinary) and is not overridden.
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STORAGES["staticfiles"] = {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"}  # noqa: F405
