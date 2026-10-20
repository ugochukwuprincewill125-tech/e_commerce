"""
Base settings shared by every environment.

All secrets and environment-specific values are read from environment
variables (loaded from backend/.env in development). Never hardcode secrets.
"""
from datetime import timedelta
from pathlib import Path
import os

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("SECRET_KEY", "")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
]

LOCAL_APPS = [
    "apps.core",
    "apps.users",
    "apps.notifications",
    "apps.categories",
    "apps.brands",
    "apps.products",
    "apps.promotions",
    "apps.cart",
    "apps.wishlist",
    "apps.orders",
    "apps.payments",
    "apps.reviews",
    "apps.admin_api",
    "apps.ai_chat",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database — PostgreSQL via DATABASE_URL (Supabase in production)
# ---------------------------------------------------------------------------
# Supabase "Connect → Connection string → URI" works as-is. Prefer the
# "Session pooler" URI (port 5432) so no IPv6 dependency; for heavy admin
# queries use the direct URI. Example:
#   postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL", default="postgres://postgres:postgres@localhost:5432" + "/timeline_db",
        conn_max_age=int(os.getenv("DB_CONN_MAX_AGE", "60")),
    )
}

# ---------------------------------------------------------------------------
# Media storage — Cloudinary with local fallback
# ---------------------------------------------------------------------------
# When the CLOUDINARY_* variables are absent (local development) Django serves
# media from backend/media/ with FileSystemStorage.
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    MEDIA_BACKEND = "apps.core.storage.CloudinaryMediaStorage"
    CLOUDINARY_STORAGE = {
        "CLOUD_NAME": CLOUDINARY_CLOUD_NAME,
        "API_KEY": CLOUDINARY_API_KEY,
        "API_SECRET": CLOUDINARY_API_SECRET,
    }
else:
    MEDIA_BACKEND = "django.core.files.storage.FileSystemStorage"

STORAGES = {
    "default": {"BACKEND": MEDIA_BACKEND},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Lagos"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static & media
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    # Rejects JWTs belonging to accounts that have not confirmed their email.
    # Staff are exempt so an admin created in Django admin cannot lock
    # themselves out of the management area.
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.users.authentication.VerifiedEmailJWTAuthentication",
    ),
    # Secure by default: every endpoint requires auth unless a view explicitly
    # opts out with permission_classes = [AllowAny]. Public storefront reads
    # declare AllowAny explicitly; nothing is world-writable by accident.
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 12,
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON", "120/min"),
        "user": os.getenv("THROTTLE_USER", "300/min"),
        "auth": os.getenv("THROTTLE_AUTH", "10/min"),
        "contact": os.getenv("THROTTLE_CONTACT", "5/hour"),
        "payments": os.getenv("THROTTLE_PAYMENTS", "30/min"),
        "ai_chat": os.getenv("THROTTLE_AI_CHAT", "30/min"),
    },
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ---------------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
    "x-csrftoken",
    "x-requested-with",
    "x-cart-session",
]
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", ",".join(CORS_ALLOWED_ORIGINS))

# The Django admin site lives on a non-obvious path so bots skimming for
# /admin/ find nothing. Override with DJANGO_ADMIN_URL in production.
ADMIN_URL = os.getenv("DJANGO_ADMIN_URL", "django-control/")

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
# Django's email backend is the fallback whenever Brevo is not configured (and
# the capture-only provider in test mode). In development the default console
# backend prints messages to the terminal; in production it can still be SMTP
# if you prefer. Brevo is used whenever BREVO_API_KEY is set; a transient Brevo
# failure is retried from the outbox rather than silently switching providers.
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv(
    "DEFAULT_FROM_EMAIL", "Timeline Gadgets <timelinegadgets4@gmail.com>"
)

# Production must never silently "send" through Django's console backend when
# Brevo and SMTP are both missing. The outbox records a failed message instead.
EMAIL_REQUIRE_REAL_PROVIDER = env_bool("EMAIL_REQUIRE_REAL_PROVIDER", False)

# ---------------------------------------------------------------------------
# Transactional email — Brevo HTTP API (server-side only)
# ---------------------------------------------------------------------------
# The sender is a plain environment value on purpose: while you do not own a
# domain, use an address you can verify in Brevo (for example your Gmail
# address). After you buy and authenticate a domain in Brevo, change only these
# values — no code changes are needed.
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_API_URL = os.getenv("BREVO_API_URL", "https://api.brevo.com/v3").rstrip("/")
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "Timeline Gadgets")
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "timelinegadgets4@gmail.com")
BREVO_REPLY_TO_EMAIL = os.getenv("BREVO_REPLY_TO_EMAIL", BREVO_SENDER_EMAIL)
BREVO_API_TIMEOUT = int(os.getenv("BREVO_API_TIMEOUT", "15"))

# Test mode is ON by default in development (see dev.py) and forced OFF in
# production. When on, every message is redirected to EMAIL_TEST_RECIPIENT. If
# no test recipient is configured, the message is printed to the console
# instead of being sent — never delivered to a real customer.
EMAIL_TEST_MODE = env_bool("EMAIL_TEST_MODE", DEBUG)
EMAIL_TEST_RECIPIENT = os.getenv("EMAIL_TEST_RECIPIENT", "").strip()

# Delivery retry policy. A failed API call is retried immediately a couple of
# times, then left due for the scheduled retry command / maintenance endpoint.
EMAIL_MAX_ATTEMPTS = max(1, int(os.getenv("EMAIL_MAX_ATTEMPTS", "5")))
EMAIL_IMMEDIATE_ATTEMPTS = max(1, int(os.getenv("EMAIL_IMMEDIATE_ATTEMPTS", "2")))
EMAIL_RETRY_AFTER_MINUTES = max(1, int(os.getenv("EMAIL_RETRY_AFTER_MINUTES", "10")))

# ---------------------------------------------------------------------------
# Contact inbox
# ---------------------------------------------------------------------------
# Every message submitted through the storefront contact form is stored in the
# admin Messages inbox and a copy is emailed here. Keep this address private:
# it is only read by the server.
CONTACT_NOTIFICATION_EMAIL = os.getenv(
    "CONTACT_NOTIFICATION_EMAIL", "timelinegadgets4@gmail.com"
).strip()

# ---------------------------------------------------------------------------
# Order inbox
# ---------------------------------------------------------------------------
# A copy of every new order is emailed here so the team hears about a checkout
# the moment it happens, without watching the admin dashboard. The customer
# still gets their own confirmation — this is the second copy, for the store.
# Set it to an empty value to turn the copy off.
ORDER_NOTIFICATION_EMAIL = os.getenv(
    "ORDER_NOTIFICATION_EMAIL", "timelinegadgets4@gmail.com"
).strip()

# ---------------------------------------------------------------------------
# Google Sign-In
# ---------------------------------------------------------------------------
# The same OAuth web client ID is used by the React app
# (VITE_GOOGLE_CLIENT_ID) and by the backend to validate the ID token's `aud`
# claim. Create it under Google Cloud Console -> APIs & Services -> Credentials
# and add the storefront origins to "Authorised JavaScript origins".
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_TOKENINFO_URL = os.getenv(
    "GOOGLE_TOKENINFO_URL", "https://oauth2.googleapis.com/tokeninfo"
).rstrip("/")
GOOGLE_API_TIMEOUT = int(os.getenv("GOOGLE_API_TIMEOUT", "10"))

# ---------------------------------------------------------------------------
# Store configuration
# ---------------------------------------------------------------------------
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

LOW_STOCK_THRESHOLD = int(os.getenv("LOW_STOCK_THRESHOLD", "5"))
SHIPPING_FEE_LAGOS = int(os.getenv("SHIPPING_FEE_LAGOS", "3500"))
SHIPPING_FEE_SOUTH_WEST = int(os.getenv("SHIPPING_FEE_SOUTH_WEST", "5500"))
SHIPPING_FEE_DEFAULT = int(os.getenv("SHIPPING_FEE_DEFAULT", "7500"))
FREE_SHIPPING_THRESHOLD = int(os.getenv("FREE_SHIPPING_THRESHOLD", "1000000"))
UNPAID_ORDER_EXPIRY_HOURS = int(os.getenv("UNPAID_ORDER_EXPIRY_HOURS", "48"))
# Token for the maintenance endpoint the scheduled GitHub workflow calls
# (cancels expired unpaid orders so they stop holding stock). Unset = disabled.
MAINTENANCE_TOKEN = os.getenv("MAINTENANCE_TOKEN", "")
REVIEWS_REQUIRE_APPROVAL = env_bool("REVIEWS_REQUIRE_APPROVAL", False)

# ---------------------------------------------------------------------------
# Paystack — keys are ONLY read on the server. The public key is exposed via
# /api/payments/config/; the secret key never leaves the backend.
# ---------------------------------------------------------------------------
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "")
PAYSTACK_BASE_URL = os.getenv("PAYSTACK_BASE_URL", "https://api.paystack.co")
# Test mode lets you complete the checkout flow locally without Paystack keys.
# It is forced OFF when DEBUG is False (see prod.py).
PAYMENT_TEST_MODE = env_bool("PAYMENT_TEST_MODE", not PAYSTACK_SECRET_KEY)

# ---------------------------------------------------------------------------
# AI chat — the customer Shopping Assistant. One provider key is enough;
# the proxy tries GROQ first, then XAI. Keys never leave the server.
# ---------------------------------------------------------------------------
# GROQ
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1").rstrip("/")
GROQ_MODEL = os.getenv("GROQ_MODEL", os.getenv("AI_MODEL", "openai/gpt-oss-120b"))

# XAI (Grok) — optional fallback provider
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_API_URL = os.getenv("XAI_API_URL", "https://api.x.ai/v1").rstrip("/")
XAI_MODEL = os.getenv("XAI_MODEL", "grok-3-mini")

# Support contact surfaced by the Shopping Assistant; keep in step with
# frontend/src/components/WhatsApp/FloatingWhatsApp.jsx
SUPPORT_WHATSAPP = os.getenv("SUPPORT_WHATSAPP", "2347062895442")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}



