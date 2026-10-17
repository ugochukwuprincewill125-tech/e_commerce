"""Customer-facing delete rules for cancelled / delivered orders.

A cancelled order that later received a payment keeps its records: erasing it
would also erase the evidence that money is owed back.
"""
import pytest
from rest_framework import status

from apps.orders.models import Order, OrderStatus
from apps.orders.services import cancel_order, mark_order_paid


def _url(order):
    return f"/api/orders/{order.order_number}/"


@pytest.mark.django_db
class TestOrderDeleteGuard:
    def test_cancelled_unpaid_order_can_be_deleted(self, auth_client, order):
        cancel_order(order)
        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Order.objects.filter(pk=order.pk).exists()

    def test_cancelled_order_with_late_payment_cannot_be_deleted(self, auth_client, order):
        cancel_order(order)
        # The customer paid using a stale checkout tab after cancelling.
        mark_order_paid(order, "TGS-REF-LATE")

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "refunded before" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_delivered_paid_order_can_still_be_deleted(self, auth_client, order):
        order, _ = mark_order_paid(order, "TGS-REF-DELIVERED")
        Order.objects.filter(pk=order.pk).update(status=OrderStatus.DELIVERED)

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_placed_order_cannot_be_deleted(self, auth_client, order):
        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "cancelled or delivered" in resp.data["detail"].lower()
