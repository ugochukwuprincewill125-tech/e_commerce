"""Queue, render, deliver and retry transactional email.

The outbox row is created in the same database transaction as the business
event. Delivery starts on ``transaction.on_commit``, so the customer never gets
an email for an order/payment that was rolled back.
"""
import logging
import time
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .models import TransactionalEmail
from .providers import EmailSendError, choose_provider, send_message
from .renderers import render_email

logger = logging.getLogger(__name__)

INFLIGHT_STALE_MINUTES = 5


def mask_email(value):
    """A log-safe representation of an email address."""
    value = (value or "").strip()
    if "@" not in value:
        return value or "—"
    local, domain = value.rsplit("@", 1)
    if len(local) <= 2:
        local = f"{local[:1]}***"
    else:
        local = f"{local[:2]}***"
    return f"{local}@{domain}"


def email_status():
    """A secret-free snapshot of the transactional-email pipeline.

    The public health endpoint uses it so a deployment can be checked from
    the outside: which provider would be used, whether test mode is on, and
    how many messages are still failing. No address, key or message body is
    included.
    """
    from .providers import (
        choose_provider,
        deliverability_warning,
        sender_domain,
        sender_is_consumer_mailbox,
    )

    provider = choose_provider(
        test_mode=bool(settings.EMAIL_TEST_MODE),
        effective_recipient=(settings.EMAIL_TEST_RECIPIENT or "").strip(),
    )
    snapshot = {
        "provider": provider,
        "configured": provider in ("brevo", "django"),
        "test_mode": bool(settings.EMAIL_TEST_MODE),
        "sender": settings.BREVO_SENDER_EMAIL,
        "sender_domain": sender_domain(),
        "sender_is_free_mailbox": sender_is_consumer_mailbox(),
        "warning": deliverability_warning(),
        "sent_last_24h": None,
        "failed": None,
        "pending": None,
    }
    try:
        now = timezone.now()
        snapshot["sent_last_24h"] = TransactionalEmail.objects.filter(
            status=TransactionalEmail.Status.SENT,
            sent_at__gte=now - timedelta(days=1),
        ).count()
        snapshot["failed"] = TransactionalEmail.objects.filter(
            status=TransactionalEmail.Status.FAILED
        ).count()
        snapshot["pending"] = TransactionalEmail.objects.filter(
            status__in=(TransactionalEmail.Status.PENDING, TransactionalEmail.Status.SENDING)
        ).count()
    except Exception:
        # The health endpoint has to answer even when the database is down.
        logger.warning("Could not read the email outbox for the status summary.", exc_info=True)
    return snapshot


def _resolve_recipient(to_email):
    test_mode = bool(settings.EMAIL_TEST_MODE)
    if not test_mode:
        return False, to_email.strip()
    return True, (settings.EMAIL_TEST_RECIPIENT or "").strip()


def enqueue_email(
    *,
    template,
    to_email,
    context,
    idempotency_key,
    event="",
    to_name="",
    metadata=None,
):
    """Persist a rendered email and schedule delivery after the commit.

    Returns the outbox row, or ``None`` when the address is missing or the
    template cannot be rendered. Email problems must never break checkout,
    registration or a webhook.
    """
    to_email = (to_email or "").strip()
    if not to_email:
        logger.warning("Skipped '%s' email: no recipient address (key=%s).", template, idempotency_key)
        return None

    test_mode, effective_recipient = _resolve_recipient(to_email)
    render_context = {
        **context,
        "test_mode": test_mode,
        "intended_recipient": to_email if test_mode else "",
    }
    try:
        subject, html_body, text_body = render_email(template, render_context)
    except Exception:
        logger.exception("Could not render email template '%s' (key=%s).", template, idempotency_key)
        return None

    defaults = {
        "template": template,
        "event": event,
        "recipient_email": to_email,
        "recipient_name": to_name or "",
        "effective_recipient": effective_recipient,
        "subject": subject,
        "html_body": html_body,
        "text_body": text_body,
        "test_mode": test_mode,
        "metadata": metadata or {},
        "status": TransactionalEmail.Status.PENDING,
    }
    try:
        with transaction.atomic():
            record, created = TransactionalEmail.objects.get_or_create(
                idempotency_key=idempotency_key,
                defaults=defaults,
            )
    except IntegrityError:
        # Another request created the row between the lookup and insert.
        record = TransactionalEmail.objects.filter(idempotency_key=idempotency_key).first()
        created = False

    if created:
        logger.info(
            "Queued email template=%s recipient=%s key=%s test_mode=%s",
            template,
            mask_email(effective_recipient or to_email),
            idempotency_key,
            test_mode,
        )
        transaction.on_commit(lambda: deliver_email(record.pk))
    else:
        logger.info("Email already queued; duplicate suppressed (key=%s).", idempotency_key)
    return record


def _claim(email_id, max_attempts):
    """Mark one outbox row as in-flight. Returns ``(record, reason)``."""
    now = timezone.now()
    with transaction.atomic():
        record = TransactionalEmail.objects.select_for_update().filter(pk=email_id).first()
        if record is None:
            return None, "missing"
        if record.status in (TransactionalEmail.Status.SENT, TransactionalEmail.Status.SKIPPED):
            return None, "done"
        if record.attempts >= max_attempts:
            TransactionalEmail.objects.filter(pk=record.pk).update(
                status=TransactionalEmail.Status.FAILED,
                is_retryable=False,
                next_retry_at=None,
                last_error=record.last_error or f"Gave up after {record.attempts} attempts.",
                updated_at=now,
            )
            return None, "exhausted"
        if (
            record.status == TransactionalEmail.Status.SENDING
            and record.last_attempt_at
            and record.last_attempt_at > now - timedelta(minutes=INFLIGHT_STALE_MINUTES)
        ):
            return None, "inflight"

        record.status = TransactionalEmail.Status.SENDING
        record.attempts += 1
        record.last_attempt_at = now
        record.save(update_fields=["status", "attempts", "last_attempt_at", "updated_at"])
        return record, "claimed"


def deliver_email(email_id, *, max_attempts=None):
    """Attempt delivery of one outbox row.

    A couple of immediate attempts are made for transient errors (network,
    Brevo 429/5xx). Non-retryable failures are final. Anything still pending is
    picked up by ``retry_due_emails`` / the maintenance endpoint.
    """
    max_attempts = int(max_attempts or settings.EMAIL_MAX_ATTEMPTS)
    immediate_attempts = min(max(1, settings.EMAIL_IMMEDIATE_ATTEMPTS), max_attempts)

    for attempt_index in range(immediate_attempts):
        record, reason = _claim(email_id, max_attempts)
        if record is None:
            if reason == "exhausted":
                logger.warning("Email %s reached its attempt limit.", email_id)
            return None

        provider = choose_provider(
            test_mode=record.test_mode,
            effective_recipient=record.effective_recipient,
        )
        # The console fallback uses the intended recipient for display only;
        # no network call is made.
        to_email = record.effective_recipient or record.recipient_email
        subject = f"[TEST] {record.subject}" if record.test_mode else record.subject

        try:
            provider, message_id = send_message(
                provider=provider,
                to_email=to_email,
                to_name=record.recipient_name,
                subject=subject,
                html_body=record.html_body,
                text_body=record.text_body,
                template=record.template,
                idempotency_key=record.idempotency_key,
            )
        except EmailSendError as exc:
            now = timezone.now()
            can_retry = exc.retryable and record.attempts < max_attempts
            next_retry_at = (
                now + timedelta(minutes=settings.EMAIL_RETRY_AFTER_MINUTES) if can_retry else None
            )
            TransactionalEmail.objects.filter(pk=record.pk).update(
                status=TransactionalEmail.Status.PENDING if can_retry else TransactionalEmail.Status.FAILED,
                provider=provider,
                is_retryable=exc.retryable,
                last_error=str(exc)[:1000],
                next_retry_at=next_retry_at,
                updated_at=now,
            )
            logger.warning(
                "Email delivery failed template=%s recipient=%s attempt=%s/%s retry=%s status=%s error=%s",
                record.template,
                mask_email(to_email),
                record.attempts,
                max_attempts,
                can_retry,
                exc.status_code or "—",
                str(exc)[:200],
            )
            if can_retry and attempt_index + 1 < immediate_attempts:
                time.sleep(min(2 ** attempt_index, 3))
                continue
            return None
        except Exception as exc:  # unexpected provider/persistence bug
            logger.exception(
                "Unexpected email failure template=%s recipient=%s: %s",
                record.template,
                mask_email(to_email),
                type(exc).__name__,
            )
            TransactionalEmail.objects.filter(pk=record.pk).update(
                status=TransactionalEmail.Status.PENDING
                if record.attempts < max_attempts
                else TransactionalEmail.Status.FAILED,
                provider=provider,
                is_retryable=True,
                last_error=str(exc)[:1000],
                next_retry_at=timezone.now() + timedelta(minutes=settings.EMAIL_RETRY_AFTER_MINUTES),
                updated_at=timezone.now(),
            )
            return None

        now = timezone.now()
        TransactionalEmail.objects.filter(pk=record.pk).update(
            status=TransactionalEmail.Status.SENT,
            provider=provider,
            provider_message_id=str(message_id or "")[:255],
            sent_at=now,
            is_retryable=False,
            last_error="",
            next_retry_at=None,
            updated_at=now,
        )
        logger.info(
            "Email sent template=%s recipient=%s provider=%s message_id=%s",
            record.template,
            mask_email(to_email),
            provider,
            (message_id or "—")[:120],
        )
        return TransactionalEmail.objects.filter(pk=record.pk).first()

    return None


def retry_due_emails(limit=25):
    """Retry queued/failed messages whose next attempt is due.

    Returns a summary dict for the management command and maintenance endpoint.
    """
    now = timezone.now()
    due = (
        TransactionalEmail.objects.filter(attempts__lt=settings.EMAIL_MAX_ATTEMPTS)
        .filter(
            Q(status=TransactionalEmail.Status.PENDING)
            | Q(status=TransactionalEmail.Status.FAILED, is_retryable=True)
            | Q(
                status=TransactionalEmail.Status.SENDING,
                last_attempt_at__lt=now - timedelta(minutes=INFLIGHT_STALE_MINUTES),
            )
        )
        .filter(Q(next_retry_at__isnull=True) | Q(next_retry_at__lte=now))
        .order_by("created_at")[: max(1, int(limit))]
    )
    records = list(due)
    for record in records:
        deliver_email(record.pk)
    sent = TransactionalEmail.objects.filter(pk__in=[r.pk for r in records], status=TransactionalEmail.Status.SENT).count()
    return {
        "checked": len(records),
        "sent": sent,
        "still_pending": len(records) - sent,
    }


def resend_email(email_id):
    """Manual staff retry from the Django admin.

    The original rendered content and test-mode decision are kept, so an old
    test-mode message can never suddenly go to a real customer.
    """
    now = timezone.now()
    updated = TransactionalEmail.objects.filter(pk=email_id).update(
        status=TransactionalEmail.Status.PENDING,
        attempts=0,
        is_retryable=True,
        last_error="",
        next_retry_at=now,
        updated_at=now,
    )
    if updated:
        return deliver_email(email_id)
    return None
