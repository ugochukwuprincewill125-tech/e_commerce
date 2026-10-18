"""Tests for payment reconciliation — late successes, stale references, and
the retry guard that stops a customer from ever paying twice for one order."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.orders.models import PaymentStatus
from apps.payments import paystack, services
from apps.payments.models import Payment


def success_payload(payment):
    """A Paystack verify payload that matches the payment under test."""
    return {
        "status": "success",
        "amount": paystack.to_kobo(payment.amount),
        "currency": "NGN",
        "reference": payment.reference,
        "channel": "card",
        "gateway_response": "Approved",
    }


@pytest.mark.django_db
class TestVerifyPaymentWithProvider:
    def test_late_success_finalises_the_payment(self, payment):
        with patch("apps.payments.services.paystack.verify_transaction", return_value=success_payload(payment)):
            outcome = services.verify_payment_with_provider(payment)
        assert outcome == "success"
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PAID

    def test_abandoned_keeps_the_order_payable(self, payment):
        with patch("apps.payments.services.paystack.verify_transaction", return_value={"status": "abandoned"}):
            outcome = services.verify_payment_with_provider(payment)
        assert outcome == "abandoned"
        payment.refresh_from_db()
        assert payment.status == Payment.Status.ABANDONED
        payment.order.refresh_from_db()
        assert payment.order.can_pay is True

    def test_unreachable_provider_leaves_everything_alone(self, payment):
        with patch("apps.payments.services.paystack.verify_transaction", side_effect=paystack.PaystackError("down")):
            outcome = services.verify_payment_with_provider(payment)
        assert outcome == "error"
        payment.refresh_from_db()
        assert payment.status == Payment.Status.INITIALIZED

    def test_unknown_reference_is_closed_for_good(self, payment):
        with patch(
            "apps.payments.services.paystack.verify_transaction",
            side_effect=paystack.PaystackNotFound("Transaction reference not found."),
        ):
            outcome = services.verify_payment_with_provider(payment)
        assert outcome == "not_found"
        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED
        payment.order.refresh_from_db()
        assert payment.order.can_pay is True

    def test_stale_read_never_regresses_a_successful_payment(self, payment):
        """If the webhook finalised a payment between selection and the row
        lock, a stale verify result must not flip it back."""
        payment.status = Payment.Status.SUCCESS
        payment.save()
        with patch("apps.payments.services.paystack.verify_transaction", return_value={"status": "abandoned"}):
            outcome = services.verify_payment_with_provider(payment)
        assert outcome == "success"
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS

    def test_payment_deleted_mid_flight_is_handled(self, payment):
        """The order can be deleted in another tab while Paystack is being
        asked — the verify must not explode on the vanished row."""
        payment_pk = payment.pk
        Payment.objects.filter(pk=payment_pk).delete()
        with patch("apps.payments.services.paystack.verify_transaction", return_value={"status": "abandoned"}):
            outcome = services.verify_payment_with_provider(payment)
        assert outcome == "not_found"


@pytest.mark.django_db
class TestReconcileOrderPayments:
    def test_cancelled_checkout_that_late_settled_is_confirmed(self, payment):
        """The exact incident this exists for: the customer cancelled, we
        recorded 'abandoned', and Paystack charged anyway."""
        payment.status = Payment.Status.ABANDONED
        payment.save()
        with patch("apps.payments.services.paystack.verify_transaction", return_value=success_payload(payment)):
            changed, results = services.reconcile_order_payments(payment.order)
        assert changed is True
        assert [outcome for _, outcome in results] == ["success"]
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.is_paid

    def test_no_open_attempts_is_a_no_op(self, order):
        changed, results = services.reconcile_order_payments(order)
        assert changed is False
        assert results == []

    def test_without_a_key_nothing_is_called(self, payment, settings):
        settings.PAYSTACK_SECRET_KEY = ""
        with patch(
            "apps.payments.services.paystack.verify_transaction",
            side_effect=AssertionError("must not be called without a key"),
        ):
            changed, results = services.reconcile_order_payments(payment.order)
        assert changed is False
        assert results == []

    def test_window_bounds_the_lookback(self, payment):
        Payment.objects.filter(pk=payment.pk).update(created_at=timezone.now() - timedelta(hours=72))
        assert services.open_payments(hours=48) == []
        assert len(services.open_payments(hours=168)) == 1


@pytest.mark.django_db
class TestInitializeRechecksPreviousAttempts:
    def test_late_success_blocks_a_second_checkout(self, auth_client, order, payment, settings):
        """A charge that settled after the customer cancelled is confirmed at
        retry time — they are sent to the callback, never to a second charge."""
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("payment-initialize")
        with patch("apps.payments.views.paystack.verify_transaction", return_value=success_payload(payment)):
            resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["already_paid"] is True
        assert "/payment/callback?reference=" in resp.data["authorization_url"]
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.PAID
        assert order.payments.count() == 1

    def test_in_flight_attempt_is_handed_back_not_duplicated(self, auth_client, order, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("payment-initialize")
        with patch("apps.payments.views.paystack.verify_transaction", return_value={"status": "ongoing"}):
            resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["pending"] is True
        assert resp.data["reference"] == payment.reference
        assert resp.data["authorization_url"] == payment.authorization_url
        assert order.payments.count() == 1

    def test_dead_attempt_is_replaced_with_a_fresh_one(self, auth_client, order, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("payment-initialize")
        with patch("apps.payments.views.paystack.verify_transaction", return_value={"status": "failed"}), patch(
            "apps.payments.views.paystack.initialize_transaction"
        ) as mock_init:
            mock_init.return_value = {"authorization_url": "https://paystack.com/pay/new", "access_code": "newcode"}
            resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["reference"] != payment.reference
        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED
        assert order.payments.filter(status=Payment.Status.INITIALIZED).count() == 1

    def test_unreachable_provider_falls_back_to_reusing_the_attempt(self, auth_client, order, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("payment-initialize")
        with patch("apps.payments.views.paystack.verify_transaction", side_effect=paystack.PaystackError("down")):
            resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["reference"] == payment.reference
        assert resp.data["authorization_url"] == payment.authorization_url
        assert order.payments.count() == 1


@pytest.mark.django_db
class TestRefreshPaymentEndpoint:
    def test_detects_late_success(self, auth_client, order, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("order-refresh-payment", kwargs={"order_number": order.order_number})
        with patch("apps.payments.services.paystack.verify_transaction", return_value=success_payload(payment)):
            resp = auth_client.post(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["payment_check"] == "updated"
        assert resp.data["payment_status"] == PaymentStatus.PAID
        assert resp.data["is_paid"] is True
        assert resp.data["can_pay"] is False

    def test_reports_no_change_when_still_open(self, auth_client, order, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("order-refresh-payment", kwargs={"order_number": order.order_number})
        with patch("apps.payments.services.paystack.verify_transaction", return_value={"status": "ongoing"}):
            resp = auth_client.post(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["payment_check"] == "no_change"
        assert resp.data["payment_status"] == PaymentStatus.PENDING

    def test_reports_unavailable_when_paystack_is_down(self, auth_client, order, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("order-refresh-payment", kwargs={"order_number": order.order_number})
        with patch("apps.payments.services.paystack.verify_transaction", side_effect=paystack.PaystackError("down")):
            resp = auth_client.post(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["payment_check"] == "unavailable"

    def test_other_customers_get_a_404(self, auth_client, order, payment, settings):
        from apps.users.models import User

        other = User.objects.create_user(email="other-owner@example.com", first_name="O", last_name="Other", password="P@ss1234!")
        order.user = other
        order.save()
        url = reverse("order-refresh-payment", kwargs={"order_number": order.order_number})
        resp = auth_client.post(url)
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_requires_auth(self, api_client, order):
        url = reverse("order-refresh-payment", kwargs={"order_number": order.order_number})
        assert api_client.post(url).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestReconcileMaintenanceEndpoint:
    def test_disabled_without_token(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = ""
        resp = api_client.post(reverse("payments-maintenance-reconcile"), HTTP_X_MAINTENANCE_TOKEN="anything")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_rejects_wrong_token(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        resp = api_client.post(reverse("payments-maintenance-reconcile"), HTTP_X_MAINTENANCE_TOKEN="guessed")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_sweep_confirms_late_success(self, api_client, payment, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        with patch("apps.payments.services.paystack.verify_transaction", return_value=success_payload(payment)):
            resp = api_client.post(reverse("payments-maintenance-reconcile"), HTTP_X_MAINTENANCE_TOKEN="top-secret")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == {"checked": 1, "newly_paid": 1}
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PAID


@pytest.mark.django_db
class TestReconcileCommand:
    def test_dry_run_lists_but_touches_nothing(self, payment):
        call_command("reconcile_payments", "--dry-run", "--hours=24")
        payment.refresh_from_db()
        assert payment.status == Payment.Status.INITIALIZED

    def test_sweep_confirms_late_success(self, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        with patch("apps.payments.services.paystack.verify_transaction", return_value=success_payload(payment)):
            call_command("reconcile_payments", "--hours=24")
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PAID
