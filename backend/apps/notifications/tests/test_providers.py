"""Brevo HTTP client: payload shape, authentication and error classification."""
import pytest
import requests

from apps.notifications.providers import EmailSendError, brevo_is_configured, send_message


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


def _message(**overrides):
    payload = {
        "provider": "brevo",
        "to_email": "customer@example.com",
        "to_name": "Test Customer",
        "subject": "Order received",
        "html_body": "<p>Hello</p>",
        "text_body": "Hello",
        "template": "order_confirmation",
        "idempotency_key": "order-confirmation:1",
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def brevo_settings(settings):
    settings.BREVO_API_KEY = "xkeysib-secret"
    settings.BREVO_API_URL = "https://api.brevo.com/v3"
    settings.BREVO_SENDER_NAME = "Timeline Gadgets"
    settings.BREVO_SENDER_EMAIL = "timelinegadget@gmail.com"
    settings.BREVO_REPLY_TO_EMAIL = "timelinegadget@gmail.com"
    settings.BREVO_API_TIMEOUT = 5
    return settings


class TestBrevoPayload:
    def test_sends_the_expected_payload(self, brevo_settings, monkeypatch):
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update(url=url, json=json, headers=headers, timeout=timeout)
            return FakeResponse(201, {"messageId": "<201@brevo>"})

        monkeypatch.setattr("apps.notifications.providers.requests.post", fake_post)

        provider, message_id = send_message(**_message())

        assert provider == "brevo"
        assert message_id == "<201@brevo>"
        assert captured["url"] == "https://api.brevo.com/v3/smtp/email"
        assert captured["headers"]["api-key"] == "xkeysib-secret"
        assert captured["json"]["sender"] == {"name": "Timeline Gadgets", "email": "timelinegadget@gmail.com"}
        assert captured["json"]["to"] == [{"email": "customer@example.com", "name": "Test Customer"}]
        assert captured["json"]["subject"] == "Order received"
        assert captured["json"]["htmlContent"] == "<p>Hello</p>"
        assert captured["json"]["textContent"] == "Hello"
        assert captured["json"]["tags"] == ["transactional", "order_confirmation"]
        assert "api-key" not in str(captured["json"])

    def test_missing_sender_is_a_permanent_error(self, brevo_settings, monkeypatch):
        brevo_settings.BREVO_SENDER_EMAIL = ""
        assert brevo_is_configured() is False
        with pytest.raises(EmailSendError) as exc:
            send_message(**_message())
        assert exc.value.retryable is False


class TestBrevoErrors:
    @pytest.mark.parametrize(
        "status_code,retryable",
        [(400, False), (401, False), (403, False), (404, False), (429, True), (500, True), (503, True)],
    )
    def test_status_codes_are_classified_for_retry(self, brevo_settings, monkeypatch, status_code, retryable):
        monkeypatch.setattr(
            "apps.notifications.providers.requests.post",
            lambda *a, **k: FakeResponse(status_code, {"message": "provider said no"}),
        )
        with pytest.raises(EmailSendError) as exc:
            send_message(**_message())
        assert exc.value.retryable is retryable
        assert exc.value.status_code == status_code

    def test_network_errors_are_retryable(self, brevo_settings, monkeypatch):
        def raise_connection(*args, **kwargs):
            raise requests.ConnectionError("boom")

        monkeypatch.setattr("apps.notifications.providers.requests.post", raise_connection)
        with pytest.raises(EmailSendError) as exc:
            send_message(**_message())
        assert exc.value.retryable is True
        assert "secret" not in str(exc.value)
