"""Tests for the payment API views."""
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status

from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.payments.models import Payment


@pytest.mark.django_db
class TestPaymentConfigView:
    def test_config_returns_public_key(self, api_client, settings):
        settings.PAYSTACK_PUBLIC_KEY = "pk_live_12345"
        settings.PAYSTACK_SECRET_KEY = "sk_live_67890"
        url = reverse("payment-config")
        resp = api_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["provider"] == "paystack"
        assert resp.data["public_key"] == "pk_live_12345"
        assert resp.data["configured"] is True
        assert resp.data["currency"] == "NGN"

    def test_config_test_mode(self, api_client, settings):
        settings.PAYSTACK_PUBLIC_KEY = "pk_test_12345"
        settings.PAYSTACK_SECRET_KEY = ""
        settings.DEBUG = True
        settings.PAYMENT_TEST_MODE = True
        url = reverse("payment-config")
        resp = api_client.get(url)
        assert resp.data["test_mode"] is True
        assert resp.data["configured"] is False

    def test_config_no_keys(self, api_client, settings):
        settings.PAYSTACK_SECRET_KEY = ""
        settings.PAYSTACK_PUBLIC_KEY = ""
        url = reverse("payment-config")
        resp = api_client.get(url)
        assert resp.data["configured"] is False


@pytest.mark.django_db
class TestInitializePaymentView:
    def test_initialize_success(self, auth_client, order, settings):
        url = reverse("payment-initialize")
        with patch("apps.payments.views.paystack.initialize_transaction") as mock_init:
            mock_init.return_value = {
                "authorization_url": "https://paystack.com/pay/abc",
                "access_code": "code123",
            }
            resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["authorization_url"] == "https://paystack.com/pay/abc"
        assert resp.data["reference"] is not None
        assert resp.data["test_mode"] is False

    def test_initialize_idempotent_returns_existing(self, auth_client, order, payment, settings):
        """An order with an existing INITIALIZED payment should reuse it."""
        payment.status = Payment.Status.INITIALIZED
        payment.save()
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["reference"] == payment.reference

    def test_initialize_retires_attempt_without_checkout_url(self, auth_client, order, payment, settings):
        """An initialized payment that stored no checkout URL is a dead end —
        retire it and mint a fresh one instead of handing the browser an
        empty redirect."""
        settings.PAYSTACK_SECRET_KEY = ""
        settings.DEBUG = True
        settings.PAYMENT_TEST_MODE = True
        payment.authorization_url = ""
        payment.save()
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["reference"] != payment.reference
        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED

    def test_initialize_already_paid(self, auth_client, order, settings):
        order.payment_status = PaymentStatus.PAID
        order.save()
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "already been paid" in resp.data["detail"].lower()

    def test_initialize_order_not_found(self, auth_client, customer):
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": "NONEXISTENT"})
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_initialize_requires_auth(self, api_client, order):
        url = reverse("payment-initialize")
        resp = api_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_initialize_other_users_order(self, auth_client, order):
        from apps.users.models import User
        other = User.objects.create_user(email="other@example.com", first_name="O", last_name="Other", password="P@ss1234!")
        order.user = other
        order.save()
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_initialize_cannot_pay(self, auth_client, order):
        order.status = OrderStatus.PROCESSING
        order.save()
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "can no longer be paid" in resp.data["detail"].lower()

    def test_initialize_paystack_error(self, auth_client, order, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        url = reverse("payment-initialize")
        from apps.payments import paystack
        with patch.object(paystack, "initialize_transaction", side_effect=paystack.PaystackError("API down")):
            resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_502_BAD_GATEWAY

    def test_initialize_test_mode(self, auth_client, order, settings):
        """When no secret key is configured, test mode kicks in (dev only)."""
        settings.PAYSTACK_SECRET_KEY = ""
        settings.DEBUG = True
        settings.PAYMENT_TEST_MODE = True
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["test_mode"] is True

    def test_initialize_not_configured(self, auth_client, order, settings):
        settings.PAYSTACK_SECRET_KEY = ""
        settings.DEBUG = False
        settings.PAYMENT_TEST_MODE = False
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_initialize_free_order(self, auth_client, order, settings):
        """A fully discounted order is confirmed without calling Paystack."""
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        order.total = Decimal("0.00")
        order.save()
        url = reverse("payment-initialize")
        resp = auth_client.post(url, {"order_number": order.order_number})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["free_order"] is True
        assert "/payment/callback" in resp.data["authorization_url"]
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.PAID
        free_payment = order.payments.get()
        assert free_payment.provider == Payment.Provider.FREE
        assert free_payment.status == Payment.Status.SUCCESS


@pytest.mark.django_db
class TestVerifyPaymentView:
    def test_verify_success(self, auth_client, payment, settings):
        from apps.payments import paystack as ps

        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        with patch("apps.payments.views.paystack.verify_transaction") as mock_verify:
            mock_verify.return_value = {
                "status": "success",
                "amount": ps.to_kobo(payment.amount),
                "currency": "NGN",
                "reference": payment.reference,
                "channel": "card",
                "gateway_response": "Successful",
            }
            resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is True
        assert resp.data["status"] == "success"
        payment.refresh_from_db()
        assert payment.status == Payment.Status.SUCCESS
        assert payment.order.is_paid is True

    def test_verify_idempotent(self, auth_client, payment, settings):
        """Already-paid payments should not call Paystack again."""
        from apps.orders.services import mark_order_paid
        mark_order_paid(payment.order, payment.reference)
        payment.status = Payment.Status.SUCCESS
        payment.save()
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is True

    def test_verify_test_mode(self, auth_client, payment, settings):
        payment.provider = Payment.Provider.TEST
        payment.save()
        settings.DEBUG = True
        settings.PAYMENT_TEST_MODE = True
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is True
        assert resp.data["test_mode"] is True

    def test_verify_test_mode_disabled(self, auth_client, payment, settings):
        payment.provider = Payment.Provider.TEST
        payment.save()
        settings.DEBUG = False
        settings.PAYMENT_TEST_MODE = False
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_amount_mismatch(self, auth_client, payment, settings):
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        with patch("apps.payments.views.paystack.verify_transaction") as mock_verify:
            mock_verify.return_value = {
                "status": "success",
                "amount": 999999,
                "currency": "NGN",
                "reference": payment.reference,
            }
            resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is False
        payment.refresh_from_db()
        assert payment.status == Payment.Status.FAILED

    def test_verify_payment_not_found(self, auth_client):
        url = reverse("payment-verify", kwargs={"reference": "NOPE-1234"})
        resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_verify_other_user_payment(self, auth_client, payment):
        from apps.users.models import User
        other = User.objects.create_user(email="other2@example.com", first_name="O", last_name="O", password="P@ss1234!")
        payment.order.user = other
        payment.order.save()
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_verify_pending_keeps_payment_initialized(self, auth_client, payment, settings):
        """A transaction Paystack has not finished must stay open — failing it
        is what scares a customer into paying a second time."""
        from apps.payments import paystack as ps

        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        with patch("apps.payments.views.paystack.verify_transaction") as mock_verify:
            mock_verify.return_value = {
                "status": "ongoing",
                "amount": ps.to_kobo(payment.amount),
                "currency": "NGN",
                "reference": payment.reference,
            }
            resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is False
        assert resp.data["pending"] is True
        payment.refresh_from_db()
        assert payment.status == Payment.Status.INITIALIZED
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PENDING

    def test_verify_abandoned_closes_attempt_but_leaves_order_payable(self, auth_client, payment, settings):
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        with patch("apps.payments.views.paystack.verify_transaction") as mock_verify:
            mock_verify.return_value = {
                "status": "abandoned",
                "amount": 0,
                "currency": "NGN",
                "reference": payment.reference,
            }
            resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is False
        assert resp.data["pending"] is False
        payment.refresh_from_db()
        assert payment.status == Payment.Status.ABANDONED
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.PENDING
        assert payment.order.can_pay is True

    def test_verify_free_order_reports_success(self, auth_client, payment, settings):
        """Free orders are born successful — verify must not call Paystack."""
        from apps.orders.services import mark_order_paid

        payment.provider = Payment.Provider.FREE
        payment.status = Payment.Status.SUCCESS
        payment.save()
        mark_order_paid(payment.order, payment.reference)
        url = reverse("payment-verify", kwargs={"reference": payment.reference})
        resp = auth_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["success"] is True
        assert resp.data["pending"] is False


@pytest.mark.django_db
class TestRefundPaymentView:
    def _paid(self, payment, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        payment.status = Payment.Status.SUCCESS
        payment.save()
        payment.order.payment_status = PaymentStatus.PAID
        payment.order.save()

    def test_refund_full_success(self, staff_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        with patch("apps.payments.services.paystack.refund_transaction") as mock_refund:
            mock_refund.return_value = {"status": "success", "amount": 50000, "id": 777}
            resp = staff_client.post(url, {})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["refunded"] == str(payment.amount)
        payment.refresh_from_db()
        # A refunded charge is still a successful charge: keep the gateway
        # record intact and let the order carry the refund state.
        assert payment.status == Payment.Status.SUCCESS
        payment.order.refresh_from_db()
        assert payment.order.payment_status == PaymentStatus.REFUNDED
        assert payment.order.refund_amount == payment.amount
        assert payment.order.refund_reference == "777"

    def test_refund_partial_success(self, staff_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        with patch("apps.payments.services.paystack.refund_transaction") as mock_refund:
            mock_refund.return_value = {"status": "success", "amount": 20000, "id": 778}
            resp = staff_client.post(url, {"amount": "200.00", "note": "Damaged"})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["refunded"] == "200.00"
        payment.order.refresh_from_db()
        # Only part of the money came back: the order stays paid, with the
        # refunded amount recorded and the remainder still refundable.
        assert payment.order.payment_status == PaymentStatus.PAID
        assert payment.order.refund_amount == Decimal("200.00")

    def test_refund_partials_accumulate_then_complete(self, staff_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        with patch("apps.payments.services.paystack.refund_transaction") as mock_refund:
            mock_refund.return_value = {"status": "success", "amount": 20000, "id": 779}
            resp = staff_client.post(url, {"amount": "200.00"})
            assert resp.status_code == status.HTTP_200_OK
            mock_refund.return_value = {"status": "success", "amount": 30000, "id": 780}
            resp = staff_client.post(url, {"amount": "300.00"})
            assert resp.status_code == status.HTTP_200_OK
        payment.order.refresh_from_db()
        assert payment.order.refund_amount == payment.amount
        assert payment.order.payment_status == PaymentStatus.REFUNDED

    def test_refund_more_than_remaining_fails(self, staff_client, payment, settings):
        self._paid(payment, settings)
        payment.order.refund_amount = Decimal("400.00")
        payment.order.save()
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        resp = staff_client.post(url, {"amount": "200.00"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed" in resp.data["detail"].lower()

    def test_refund_not_paid_fails(self, staff_client, payment):
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        resp = staff_client.post(url, {})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "paid" in resp.data["detail"].lower()

    def test_refund_requires_staff(self, auth_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        resp = auth_client.post(url, {})
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_refund_amount_exceeds_paid(self, staff_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        resp = staff_client.post(url, {"amount": "999999.00"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed" in resp.data["detail"].lower()

    def test_refund_negative_amount_rejected(self, staff_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        resp = staff_client.post(url, {"amount": "-50.00"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_refund_paystack_error(self, staff_client, payment, settings):
        self._paid(payment, settings)
        url = reverse("payment-refund", kwargs={"order_number": payment.order.order_number})
        from apps.payments import paystack
        with patch.object(paystack, "refund_transaction", side_effect=paystack.PaystackError("API down")):
            resp = staff_client.post(url, {})
        assert resp.status_code == status.HTTP_502_BAD_GATEWAY
        payment.order.refresh_from_db()
        # A failed gateway call must not leave a refund on the books.
        assert payment.order.refund_amount is None
        assert payment.order.payment_status == PaymentStatus.PAID

    def test_refund_order_not_found(self, staff_client):
        url = reverse("payment-refund", kwargs={"order_number": "NOPE-1234"})
        resp = staff_client.post(url, {})
        assert resp.status_code == status.HTTP_404_NOT_FOUND
