"""Deliverability guards: a message that is "sent" must actually arrive.

The provider accepts a message as soon as Brevo returns 2xx, long before the
receiving mailbox sees it. Gmail and Yahoo only accept mail whose SPF/DKIM
passes for the domain in the From address, so a free-mailbox sender is
silently dropped. These tests pin the warnings and the runtime status that
make that failure visible instead of leaving the customer with no email.
"""
import logging

import pytest
from django.utils import timezone

from apps.notifications.checks import check_email_delivery
from apps.notifications.models import TransactionalEmail
from apps.notifications.providers import (
    deliverability_warning,
    sender_domain,
    sender_is_consumer_mailbox,
)
from apps.notifications.services import email_status

HEALTH = "/api/health/"


@pytest.fixture
def production_settings(settings):
    """Settings as they look in production (see config/settings/prod.py)."""
    settings.DEBUG = False
    settings.EMAIL_TEST_MODE = False
    settings.EMAIL_TEST_RECIPIENT = ""
    settings.EMAIL_REQUIRE_REAL_PROVIDER = True
    settings.BREVO_API_KEY = "xkeysib-secret"
    settings.BREVO_SENDER_NAME = "Timeline Gadgets"
    settings.BREVO_SENDER_EMAIL = "no-reply@timelinegadgets.com"
    settings.BREVO_REPLY_TO_EMAIL = "timelinegadgets4@gmail.com"
    return settings


class TestSenderDomain:
    def test_a_free_mailbox_sender_is_detected(self, settings):
        settings.BREVO_SENDER_EMAIL = "timelinegadgets4@gmail.com"
        assert sender_domain() == "gmail.com"
        assert sender_is_consumer_mailbox() is True

    def test_an_authenticated_domain_sender_is_accepted(self, settings):
        settings.BREVO_SENDER_EMAIL = "no-reply@timelinegadgets.com"
        assert sender_domain() == "timelinegadgets.com"
        assert sender_is_consumer_mailbox() is False

    def test_the_warning_explains_why_gmail_drops_the_message(self, settings):
        settings.BREVO_SENDER_EMAIL = "timelinegadgets4@gmail.com"
        warning = deliverability_warning()
        assert "SPF" in warning and "DKIM" in warning
        assert "gmail.com" in warning

    def test_no_warning_for_an_authenticated_domain(self, settings):
        settings.BREVO_SENDER_EMAIL = "no-reply@timelinegadgets.com"
        assert deliverability_warning() == ""

    def test_sending_from_a_free_mailbox_is_logged(self, settings, monkeypatch, caplog):
        """The server log has to name the reason, not just report success."""
        from apps.notifications import providers

        class FakeResponse:
            status_code = 201

            def json(self):
                return {"messageId": "<1@brevo>"}

        monkeypatch.setattr(
            providers.requests, "post", lambda *a, **k: FakeResponse()
        )
        settings.BREVO_API_KEY = "xkeysib-secret"
        settings.BREVO_SENDER_EMAIL = "timelinegadgets4@gmail.com"

        with caplog.at_level(logging.WARNING, logger="apps.notifications.providers"):
            providers.send_message(
                provider="brevo",
                to_email="customer@example.com",
                to_name="Customer",
                subject="Welcome",
                html_body="<p>Hi</p>",
                text_body="Hi",
                template="welcome",
            )

        assert any("SPF" in record.message for record in caplog.records)


class TestHealthEndpoint:
    def test_health_reports_the_email_configuration(self, api_client, production_settings):
        response = api_client.get(HEALTH)

        assert response.status_code == 200
        assert response.data["status"] == "ok"
        email = response.data["email"]
        assert email["provider"] == "brevo"
        assert email["configured"] is True
        assert email["test_mode"] is False
        assert email["sender"] == "no-reply@timelinegadgets.com"
        assert email["sender_is_free_mailbox"] is False

    def test_health_never_leaks_secrets(self, api_client, production_settings):
        response = api_client.get(HEALTH)
        body = str(response.data)
        assert "xkeysib-secret" not in body
        assert "BREVO_API_KEY" not in body

    def test_health_survives_a_broken_database(self, api_client, production_settings, monkeypatch):
        from apps.notifications import services

        def boom(*args, **kwargs):
            raise RuntimeError("database is down")

        monkeypatch.setattr(
            services.TransactionalEmail.objects, "filter", boom
        )
        response = api_client.get(HEALTH)

        assert response.status_code == 200
        assert response.data["email"]["failed"] is None


class TestEmailStatus:
    def test_status_counts_the_outbox(self, db, production_settings):
        TransactionalEmail.objects.create(
            idempotency_key="status-sent",
            template="welcome",
            recipient_email="customer@example.com",
            subject="Welcome",
            html_body="<p>Hi</p>",
            text_body="Hi",
            status=TransactionalEmail.Status.SENT,
            sent_at=timezone.now(),
        )
        TransactionalEmail.objects.create(
            idempotency_key="status-failed",
            template="welcome",
            recipient_email="customer@example.com",
            subject="Welcome",
            html_body="<p>Hi</p>",
            text_body="Hi",
            status=TransactionalEmail.Status.FAILED,
            last_error="provider unreachable",
        )

        status = email_status()

        assert status["sent_last_24h"] == 1
        assert status["failed"] == 1
        assert status["pending"] == 0


class TestDeploymentChecks:
    def test_a_free_mailbox_sender_is_flagged(self, production_settings):
        production_settings.BREVO_SENDER_EMAIL = "timelinegadgets4@gmail.com"

        issues = check_email_delivery(None)

        assert [issue.id for issue in issues] == ["notifications.W003"]
        assert "SPF" in issues[0].msg

    def test_a_missing_provider_is_flagged(self, production_settings):
        production_settings.BREVO_API_KEY = ""
        production_settings.EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

        issues = check_email_delivery(None)

        assert [issue.id for issue in issues] == ["notifications.W001"]

    def test_a_configured_production_setup_passes(self, production_settings):
        assert check_email_delivery(None) == []

    def test_development_is_never_flagged(self, settings):
        settings.DEBUG = True
        settings.BREVO_API_KEY = ""
        settings.BREVO_SENDER_EMAIL = "timelinegadgets4@gmail.com"

        assert check_email_delivery(None) == []
