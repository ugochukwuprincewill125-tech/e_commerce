"""Tests for the admin refund action.

The button in the admin UI must actually move money when the order was paid
through Paystack — this is the regression that previously recorded refunds
that never reached the customer.
"""
from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework import status

from apps.orders.models import PaymentStatus
from apps.payments.models import Payment


@pytest.mark.django_db
class TestAdminOrderRefund:
    def _with_paystack_payment(self, paid_order):
        return Payment.objects.create(
            order=paid_order,
            provider=Payment.Provider.PAYSTACK,
            reference=f"{paid_order.order_number}-RF1",
            amount=paid_order.total,
            currency="NGN",
            status=Payment.Status.SUCCESS,
        )

    def _url(self, order):
        return f"/api/admin-api/orders/{order.id}/refund/"

    def test_refund_calls_gateway_and_records_id(self, staff_client, paid_order, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        self._with_paystack_payment(paid_order)
        with patch("apps.payments.services.paystack.refund_transaction") as mock_refund:
            mock_refund.return_value = {"status": "success", "id": 9001, "amount": 50000}
            resp = staff_client.post(self._url(paid_order), {"amount": str(paid_order.total), "reason": "Returned"})
        assert resp.status_code == status.HTTP_200_OK
        mock_refund.assert_called_once()
        assert resp.data["detail"] == "Refund sent to Paystack and recorded."
        paid_order.refresh_from_db()
        assert paid_order.payment_status == PaymentStatus.REFUNDED
        assert paid_order.refund_amount == paid_order.total
        assert paid_order.refund_reference == "9001"

    def test_partial_refund_keeps_order_paid(self, staff_client, paid_order, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        self._with_paystack_payment(paid_order)
        with patch("apps.payments.services.paystack.refund_transaction") as mock_refund:
            mock_refund.return_value = {"status": "success", "id": 9002, "amount": 10000}
            resp = staff_client.post(self._url(paid_order), {"amount": "100.00"})
        assert resp.status_code == status.HTTP_200_OK
        paid_order.refresh_from_db()
        assert paid_order.payment_status == PaymentStatus.PAID
        assert paid_order.refund_amount == Decimal("100.00")

    def test_refund_over_remaining_rejected(self, staff_client, paid_order, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        self._with_paystack_payment(paid_order)
        paid_order.refund_amount = paid_order.total - Decimal("50.00")
        paid_order.save()
        resp = staff_client.post(self._url(paid_order), {"amount": "100.00"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_manual_refund_without_paystack_record(self, staff_client, paid_order, settings):
        """Orders settled outside Paystack are recorded as manual refunds."""
        resp = staff_client.post(self._url(paid_order), {"amount": str(paid_order.total)})
        assert resp.status_code == status.HTTP_200_OK
        assert "manual refund" in resp.data["detail"].lower()
        paid_order.refresh_from_db()
        assert paid_order.payment_status == PaymentStatus.REFUNDED

    def test_gateway_failure_records_nothing(self, staff_client, paid_order, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        self._with_paystack_payment(paid_order)
        from apps.payments import paystack

        with patch.object(paystack, "refund_transaction", side_effect=paystack.PaystackError("API down")):
            resp = staff_client.post(self._url(paid_order), {"amount": "100.00"})
        assert resp.status_code == status.HTTP_502_BAD_GATEWAY
        paid_order.refresh_from_db()
        assert paid_order.payment_status == PaymentStatus.PAID
        assert paid_order.refund_amount is None
