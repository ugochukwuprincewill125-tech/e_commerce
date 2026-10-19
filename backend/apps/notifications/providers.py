"""Email delivery providers.

Brevo is the primary provider. Django's email backend is kept as a deliberate
fallback so an existing SMTP setup (or the console backend in development)
still works while Brevo is being configured.

Only this module reads BREVO_API_KEY. It is never placed in an API response,
template, log line, or frontend bundle.
"""
import logging

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection

logger = logging.getLogger(__name__)


class EmailSendError(Exception):
    """A provider rejected or could not accept a message."""

    def __init__(self, message, *, retryable=True, status_code=None):
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code


def brevo_is_configured():
    return bool(settings.BREVO_API_KEY and settings.BREVO_SENDER_EMAIL)


def sender_identity():
    return settings.BREVO_SENDER_NAME or "Timeline Gadgets", settings.BREVO_SENDER_EMAIL


def choose_provider(*, test_mode, effective_recipient):
    """Return the provider name without sending anything."""
    if test_mode and not effective_recipient:
        # No test inbox: capture the message in the console, never send it.
        return "console"
    if brevo_is_configured():
        return "brevo"
    return "django"


def send_message(*, provider, to_email, to_name, subject, html_body, text_body, template, idempotency_key=""):
    """Send one already-rendered message and return ``(provider, message_id)``.

    Raises ``EmailSendError`` with ``retryable`` set appropriately. The caller
    owns persistence/retry policy and chooses the provider beforehand.
    """
    if provider == "brevo":
        return "brevo", _send_with_brevo(
            to_email=to_email,
            to_name=to_name,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            template=template,
            idempotency_key=idempotency_key,
        )
    if provider == "console":
        _send_with_django(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            using="django.core.mail.backends.console.EmailBackend",
        )
        return "console", ""
    _send_with_django(to_email=to_email, subject=subject, html_body=html_body, text_body=text_body)
    return "django", ""


def _send_with_brevo(*, to_email, to_name, subject, html_body, text_body, template, idempotency_key):
    name, email = sender_identity()
    if not email:
        raise EmailSendError("Brevo sender email is not configured.", retryable=False)

    payload = {
        "sender": {"name": name, "email": email},
        "to": [{"email": to_email, **({"name": to_name} if to_name else {})}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body,
        "tags": ["transactional", template],
    }
    reply_to = settings.BREVO_REPLY_TO_EMAIL or email
    if reply_to:
        payload["replyTo"] = {"email": reply_to, "name": name}
    if idempotency_key:
        # Brevo documents custom headers in this map. The database outbox is
        # still the authoritative duplicate guard; this is a best-effort extra.
        payload["headers"] = {"IdempotencyKey": idempotency_key[:200]}

    try:
        response = requests.post(
            f"{settings.BREVO_API_URL}/smtp/email",
            json=payload,
            headers={
                "api-key": settings.BREVO_API_KEY,
                "accept": "application/json",
                "content-type": "application/json",
            },
            timeout=settings.BREVO_API_TIMEOUT,
        )
    except requests.RequestException as exc:
        # Never include the request headers (and therefore the API key) here.
        logger.warning("Brevo request failed for template %s (network error: %s).", template, type(exc).__name__)
        raise EmailSendError("Could not reach Brevo.", retryable=True) from exc

    try:
        body = response.json()
    except ValueError:
        body = {}

    if response.status_code in (200, 201, 202):
        return str(body.get("messageId") or body.get("messageIds") or "")

    message = str(body.get("message") or body.get("code") or "Brevo rejected the message.")[:300]
    # 429 (rate limit), 5xx and 408 are transient. Authentication, sender
    # verification and malformed-request errors need a human to fix them.
    retryable = response.status_code in (408, 425, 429) or response.status_code >= 500
    logger.warning(
        "Brevo rejected email template=%s status=%s retryable=%s message=%s",
        template,
        response.status_code,
        retryable,
        message,
    )
    raise EmailSendError(message, retryable=retryable, status_code=response.status_code)


def _send_with_django(*, to_email, subject, html_body, text_body, using=None):
    name, email = sender_identity()
    from_email = f"{name} <{email}>" if name and email else (email or settings.DEFAULT_FROM_EMAIL)
    reply_to = [settings.BREVO_REPLY_TO_EMAIL] if settings.BREVO_REPLY_TO_EMAIL else None
    connection = get_connection(backend=using) if using else get_connection()
    message = EmailMultiAlternatives(
        subject,
        text_body,
        from_email,
        [to_email],
        reply_to=reply_to,
        connection=connection,
    )
    message.attach_alternative(html_body, "text/html")
    try:
        message.send(fail_silently=False)
    except Exception as exc:  # SMTP/console backends raise many exception types
        logger.warning("Django email backend failed for %s: %s", type(exc).__name__, str(exc)[:200])
        raise EmailSendError("The email backend could not send the message.", retryable=True) from exc
