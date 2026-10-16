"""Tests for the Paystack webhook endpoint."""
import hashlib
import hmac
import json
from datetime import timedelta

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.orders.models import Order, PaymentStatus
from apps.payments.models import Payment


def _make_signature(body_bytes, secret):
    return hmac.new(secret.encode(), body_bytes, hashlib.sha512).hexdigest()


@pytest.mark.django_db
class TestWebhookSignatureVerification:
    def test_valid_signature_accepted(self, db, order, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = json.dumps({"event": "charge.success", "data": {"reference": "REF-123"}}).encode()
        sig = _make_signature(body, settings.PAYSTACK_SECRET_KEY)
        resp = client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_invalid_signature_rejected(self, db, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = b'{"event":"charge.success","data":{"reference":"REF-123"}}'
        resp = client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE="wrong-signature-here",
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_signature_rejected(self, db, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = b'{"event":"charge.success"}'
        resp = client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_malformed_json_returns_400(self, db, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = b"not json at all"
        sig = _make_signature(body, settings.PAYSTACK_SECRET_KEY)
        resp = client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestWebhookChargeSuccess:
    def _post_webhook(self, body_dict, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = json.dumps(body_dict).encode()
        sig = _make_signature(body, settings.PAYSTACK_SECRET_KEY)
        return client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )

    def test_charge_success_marks_order_paid(self, db, payment, settings):
        payment.status = Payment.Status.INITIALIZED
        payment.save()
        body = {
            "event": "charge.success",
            "data": {
                "reference": payment.reference,
                "status": "success",
                "amount": 50000,
                "currency": "NGN",
                "channel": "card",
                "gateway_response": "Successful",
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PAID
        assert payment.order.status == Order.status.field.choices[1][0]  # PAYMENT_CONFIRMED

    def test_charge_success_idempotent(self, db, payment, settings):
        """A second webhook for an already-successful payment is a no-op."""
        from apps.orders.services import mark_order_paid
        mark_order_paid(payment.order, payment.reference)
        payment.status = Payment.Status.SUCCESS
        payment.save()
        body = {
            "event": "charge.success",
            "data": {
                "reference": payment.reference,
                "status": "success",
                "amount": 500000,
                "currency": "NGN",
                "channel": "card",
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS  # unchanged

    def test_charge_success_amount_mismatch(self, db, payment, settings):
        payment.status = Payment.Status.INITIALIZED
        payment.save()
        body = {
            "event": "charge.success",
            "data": {
                "reference": payment.reference,
                "status": "success",
                "amount": 999999,  # mismatch
                "currency": "NGN",
                "channel": "card",
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PENDING

    def test_charge_success_unknown_reference_logged(self, db, settings, caplog):
        body = {
            "event": "charge.success",
            "data": {"reference": "UNKNOWN-REF-1234", "status": "success", "amount": 1000, "currency": "NGN"},
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        assert "unknown" in caplog.text.lower()


@pytest.mark.django_db
class TestWebhookChargeFailed:
    def _post_webhook(self, body_dict, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = json.dumps(body_dict).encode()
        sig = _make_signature(body, settings.PAYSTACK_SECRET_KEY)
        return client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )

    def test_charge_failed_marks_payment_failed(self, db, payment, settings):
        body = {
            "event": "charge.failed",
            "data": {
                "reference": payment.reference,
                "status": "failed",
                "amount": 500000,
                "currency": "NGN",
                "gateway_response": "Declined",
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.FAILED

    def test_charge_failed_already_success_is_noop(self, db, payment, settings):
        """An event for an already-successful payment must not downgrade it."""
        from apps.orders.services import mark_order_paid
        mark_order_paid(payment.order, payment.reference)
        payment.status = Payment.Status.SUCCESS
        payment.save()
        body = {"event": "charge.failed", "data": {"reference": payment.reference, "status": "failed"}}
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS


@pytest.mark.django_db
class TestWebhookRefundProcessed:
    def _post_webhook(self, body_dict, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = json.dumps(body_dict).encode()
        sig = _make_signature(body, settings.PAYSTACK_SECRET_KEY)
        return client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )

    def test_refund_processed_marks_order_refunded(self, db, payment, settings):
        from apps.orders.services import mark_order_paid
        mark_order_paid(payment.order, payment.reference)
        payment.status = Payment.Status.SUCCESS
        payment.save()
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PAID

        body = {
            "event": "refund.processed",
            "data": {"reference": payment.reference, "amount": 500000, "status": "refunded"},
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.REFUNDED

    def test_refund_processed_idempotent(self, db, payment, settings):
        payment.order.payment_status = PaymentStatus.REFUNDED
        payment.order.save()
        body = {"event": "refund.processed", "data": {"reference": payment.reference, "amount": 500000}}
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.REFUNDED  # unchanged


@pytest.mark.django_db
class TestWebhookUnknownEvent:
    def test_unknown_event_returns_200(self, db, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_webhook_secret"
        client = APIClient()
        body = json.dumps({"event": "customeridenty_created", "data": {}}).encode()
        sig = _make_signature(body, settings.PAYSTACK_SECRET_KEY)
        resp = client.post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        assert resp.status_code == status.HTTP_200_OK
