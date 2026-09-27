import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import email_verification_token

logger = logging.getLogger(__name__)


def _uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def _send(subject, body, to):
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
    except Exception:  # pragma: no cover - never break a request because SMTP is down
        logger.exception("Failed to send email '%s' to %s", subject, to)


def send_verification_email(user):
    link = f"{settings.FRONTEND_URL}/verify-email/{_uid(user)}/{email_verification_token.make_token(user)}"
    body = (
        f"Hi {user.first_name},\n\n"
        "Welcome to Timeline Global Systems — Home of Quality Gadgets.\n\n"
        f"Please confirm your email address by opening this link:\n{link}\n\n"
        "If you didn't create an account, you can ignore this email.\n\n"
        "— Timeline Global Systems Limited"
    )
    _send("Verify your Timeline account", body, user.email)


def send_password_reset_email(user):
    link = f"{settings.FRONTEND_URL}/reset-password/{_uid(user)}/{default_token_generator.make_token(user)}"
    body = (
        f"Hi {user.first_name},\n\n"
        "We received a request to reset the password for your Timeline account.\n\n"
        f"Reset your password here:\n{link}\n\n"
        "This link expires automatically. If you didn't request it, no action is needed.\n\n"
        "— Timeline Global Systems Limited"
    )
    _send("Reset your Timeline password", body, user.email)
