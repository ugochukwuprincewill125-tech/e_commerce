"""Outbox behaviour: deduplication, test mode, console fallback and retries."""
import pytest
from django.utils import timezone

from apps.notifications.events import (
    _order_context,
    _user_context,
    send_verification_email,
    send_welcome_email,
)
from apps.notifications.models import TransactionalEmail
from apps.notifications.providers import choose_provider
from apps.notifications.services import enqueue_email, retry_due_emails

pytestmark = pytest.mark.django_db


class TestDeduplication:
    def test_same_event_only_queues_one_email(self, customer, mailoutbox, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            first = send_welcome_email(customer, "https://shop.example.com/verify/abc")
            second = send_welcome_email(customer, "https://shop.example.com/verify/abc")

        assert first.pk == second.pk
        assert TransactionalEmail.objects.filter(template="welcome").count() == 1
        assert len(mailoutbox) == 1

    def test_different_verification_links_are_not_collapsed(self, customer, mailoutbox, django_capture_on_commit_callbacks):
        """A resent verification email gets a fresh link, so it is a new message."""
        with django_capture_on_commit_callbacks(execute=True):
            send_verification_email(customer, "https://shop.example.com/verify/first")
            send_verification_email(customer, "https://shop.example.com/verify/second")

        assert TransactionalEmail.objects.filter(template="verify_email").count() == 2

    def test_missing_recipient_is_skipped_without_raising(self, db):
        record = enqueue_email(
            template="welcome",
            to_email="",
            context={},
            idempotency_key="no-recipient",
        )
        assert record is None
        assert TransactionalEmail.objects.count() == 0


class TestTestMode:
    def test_test_mode_redirects_and_marks_the_message(self, settings, customer, mailoutbox, django_capture_on_commit_callbacks):
        settings.EMAIL_TEST_MODE = True
        settings.EMAIL_TEST_RECIPIENT = "inbox@example.com"

        with django_capture_on_commit_callbacks(execute=True):
            record = send_verification_email(customer, "https://shop.example.com/verify/abc")

        record.refresh_from_db()
        assert record.test_mode is True
        assert record.recipient_email == "customer@example.com"
        assert record.effective_recipient == "inbox@example.com"
        assert record.status == TransactionalEmail.Status.SENT
        assert mailoutbox[0].to == ["inbox@example.com"]
        assert mailoutbox[0].subject.startswith("[TEST]")
        assert "intended for customer@example.com" in mailoutbox[0].alternatives[0][0]

    def test_test_mode_without_recipient_uses_console_and_sends_nothing(self, settings, customer, mailoutbox, django_capture_on_commit_callbacks):
        settings.EMAIL_TEST_MODE = True
        settings.EMAIL_TEST_RECIPIENT = ""

        with django_capture_on_commit_callbacks(execute=True):
            record = send_verification_email(customer, "https://shop.example.com/verify/abc")

        record.refresh_from_db()
        assert record.status == TransactionalEmail.Status.SENT
        assert record.provider == "console"
        assert mailoutbox == []

    def test_provider_choice_prefers_brevo_when_configured(self, settings):
        settings.BREVO_API_KEY = "key"
        settings.BREVO_SENDER_EMAIL = "sender@example.com"
        assert choose_provider(test_mode=False, effective_recipient="a@example.com") == "brevo"
        # Even with Brevo configured, capture-only test mode never sends.
        assert choose_provider(test_mode=True, effective_recipient="") == "console"


class TestTemplateSmoke:
    """Every registered template renders cleanly with a realistic context."""

    def test_every_template_renders_html_text_and_subject(self, customer, order):
        from apps.notifications.renderers import TEMPLATE_SPECS, render_email

        context = {
            **_user_context(customer),
            **_order_context(order),
            "verify_url": "https://shop.example.com/verify/uid/token",
            "reset_url": "https://shop.example.com/reset-password/uid/token",
            "receipt_code": "AAAA-BBBB-CCCC",
            "cancel_reason": "Customer changed their mind.",
            "refund_amount": "₦500.00",
            "refund_reference": "REF-1",
            "refund_is_full": True,
            "refund_note": "",
            "preheader": "A short preview.",
        }

        for slug in TEMPLATE_SPECS:
            subject, html, text = render_email(slug, context)
            assert subject.strip(), f"{slug} produced an empty subject"
            assert html.strip(), f"{slug} produced an empty HTML body"
            assert text.strip(), f"{slug} produced an empty text body"

    def test_ready_email_subject_reflects_the_fulfilment_method(self, customer, order):
        from apps.notifications.renderers import render_email

        base = {**_order_context(order), "preheader": "Ready."}

        delivery_subject, delivery_html, _ = render_email("order_ready", {**base, "is_pickup": False})
        pickup_subject, pickup_html, _ = render_email("order_ready", {**base, "is_pickup": True})

        assert "ready for delivery" in delivery_subject.lower()
        assert "ready for pickup" in pickup_subject.lower()
        assert "ready to collect" in pickup_html.lower()
        assert "delivery address" in delivery_html.lower()


class TestRetries:
    def _queued(self, **overrides):
        defaults = {
            "idempotency_key": "manual-retry",
            "template": "system_test",
            "event": "system.test",
            "recipient_email": "retry@example.com",
            "subject": "Retry me",
            "html_body": "<p>Hello</p>",
            "text_body": "Hello",
        }
        defaults.update(overrides)
        return TransactionalEmail.objects.create(**defaults)

    def test_retry_due_sends_a_retryable_failure(self, mailoutbox):
        self._queued(
            status=TransactionalEmail.Status.FAILED,
            attempts=1,
            is_retryable=True,
            next_retry_at=timezone.now(),
        )
        result = retry_due_emails()
        assert result == {"checked": 1, "sent": 1, "still_pending": 0}
        assert len(mailoutbox) == 1

    def test_non_retryable_failure_is_left_for_a_human(self, mailoutbox):
        self._queued(
            status=TransactionalEmail.Status.FAILED,
            attempts=1,
            is_retryable=False,
            next_retry_at=timezone.now(),
        )
        result = retry_due_emails()
        assert result["checked"] == 0
        assert mailoutbox == []

    def test_exhausted_attempts_are_not_retried(self, settings, mailoutbox):
        settings.EMAIL_MAX_ATTEMPTS = 2
        self._queued(status=TransactionalEmail.Status.PENDING, attempts=2, next_retry_at=timezone.now())
        result = retry_due_emails()
        assert result["checked"] == 0
        assert mailoutbox == []

    def test_future_next_retry_is_not_due_yet(self, mailoutbox):
        from datetime import timedelta

        self._queued(
            status=TransactionalEmail.Status.PENDING,
            attempts=1,
            next_retry_at=timezone.now() + timedelta(hours=1),
        )
        result = retry_due_emails()
        assert result["checked"] == 0
        assert mailoutbox == []
