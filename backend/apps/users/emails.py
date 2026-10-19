"""Customer account emails.

All messages go through the transactional-email outbox so they are stored,
deduplicated, safely retried, and redirected in test mode. This module only
builds the signed links; rendering and delivery live in ``apps.notifications``.
"""
import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from apps.notifications.events import (
    send_password_reset_email as queue_password_reset_email,
    send_verification_email as queue_verification_email,
    send_welcome_email as queue_welcome_email,
)

from .tokens import email_verification_token

logger = logging.getLogger(__name__)


def _uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def _verification_url(user):
    return (
        f"{settings.FRONTEND_URL}/verify-email/{_uid(user)}/"
        f"{email_verification_token.make_token(user)}"
    )


def send_welcome_email(user):
    """Welcome a new customer and include their email-verification link."""
    record = queue_welcome_email(user, _verification_url(user))
    if record is None:
        logger.warning("Welcome email could not be queued for user %s.", user.pk)
    return record


def send_verification_email(user):
    """Send (or resend) the verification link after a registration/edit."""
    record = queue_verification_email(user, _verification_url(user))
    if record is None:
        logger.warning("Verification email could not be queued for user %s.", user.pk)
    return record


def send_password_reset_email(user):
    link = (
        f"{settings.FRONTEND_URL}/reset-password/{_uid(user)}/"
        f"{default_token_generator.make_token(user)}"
    )
    record = queue_password_reset_email(user, link)
    if record is None:
        logger.warning("Password-reset email could not be queued for user %s.", user.pk)
    return record
