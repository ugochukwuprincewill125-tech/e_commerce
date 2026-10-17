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
class TestWebhookRobustness:
    """Duplicate charges, gateway-side refunds and disputes stay on the books."""

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

    def _pay_order(self, payment):
        from apps.orders.services import mark_order_paid

        mark_order_paid(payment.order, payment.reference)
        payment.status = Payment.Status.SUCCESS
        payment.save()

    def test_second_successful_charge_is_recorded_and_flagged(self, db, payment, settings):
        """If a customer somehow gets charged twice, the second charge must be
        visible — not silently pocketed."""
        self._pay_order(payment)
        second = Payment.objects.create(
            order=payment.order,
            provider=Payment.Provider.PAYSTACK,
            reference=f"{payment.order.order_number}-SECOND01",
            amount=payment.amount,
            currency="NGN",
            status=Payment.Status.INITIALIZED,
        )
        body = {
            "event": "charge.success",
            "data": {
                "reference": second.reference,
                "status": "success",
                "amount": int(payment.amount * 100),
                "currency": "NGN",
                "channel": "card",
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        second.refresh_from_db()
        assert second.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.payment_reference == payment.reference  # first charge kept
        assert payment.order.payment_status == PaymentStatus.PAID
        notes = " ".join(payment.order.history.values_list("note", flat=True))
        assert "Duplicate payment" in notes

    def test_refund_processed_for_our_own_refund_is_not_double_counted(self, db, payment, settings):
        from django.utils import timezone

        self._pay_order(payment)
        order = payment.order
        order.refund_amount = order.total
        order.refund_reference = "555"
        order.refunded_at = timezone.now()
        order.payment_status = PaymentStatus.REFUNDED
        order.save()

        body = {
            "event": "refund.processed",
            "data": {
                "id": 555,
                "amount": int(order.total * 100),
                "status": "processed",
                "transaction": {"reference": payment.reference},  # nested shape
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        order.refresh_from_db()
        assert order.refund_amount == order.total  # recognised, not added twice
        assert order.payment_status == PaymentStatus.REFUNDED

    def test_dashboard_refund_is_recorded(self, db, payment, settings):
        """A refund issued straight from the Paystack dashboard still lands in
        our books."""
        self._pay_order(payment)
        order = payment.order
        partial_kobo = int(order.total * 100) // 2
        body = {
            "event": "refund.processed",
            "data": {
                "id": 556,
                "amount": partial_kobo,
                "status": "processed",
                "transaction": {"reference": payment.reference},
            },
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        order.refresh_from_db()
        assert order.refund_amount is not None
        assert order.refund_amount > 0
        assert order.payment_status == PaymentStatus.PAID  # partial — still paid
        assert order.refund_reference == "556"

    def test_refund_failed_leaves_warning_note(self, db, payment, settings):
        self._pay_order(payment)
        body = {
            "event": "refund.failed",
            "data": {"id": 999, "amount": 50000, "transaction": {"reference": payment.reference}},
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        notes = " ".join(payment.order.history.values_list("note", flat=True))
        assert "failed refund" in notes.lower()

    def test_dispute_create_leaves_warning_note(self, db, payment, settings):
        self._pay_order(payment)
        body = {
            "event": "charge.dispute.create",
            "data": {"id": 321, "transaction": {"reference": payment.reference}},
        }
        resp = self._post_webhook(body, settings)
        assert resp.status_code == status.HTTP_200_OK
        notes = " ".join(payment.order.history.values_list("note", flat=True))
        assert "dispute" in notes.lower()


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
