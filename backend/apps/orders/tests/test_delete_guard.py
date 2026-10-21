"""Customer-facing delete rules for placed-but-unpaid orders.

Customers can only delete an order that is still "placed" AND whose payment
was never made. Delivered, cancelled, refunded, processing, or paid orders are
all locked down — the delete button disappears and a DELETE attempt gets a 400.
"""
import pytest
from rest_framework import status

from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import cancel_order, mark_order_paid


def _url(order):
    return f"/api/orders/{order.order_number}/"


@pytest.mark.django_db
class TestOrderDeleteGuard:
    def test_placed_unpaid_order_can_be_deleted(self, auth_client, order):
        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Order.objects.filter(pk=order.pk).exists()

    @pytest.mark.parametrize(
        ("payment_state", "expected_status"),
        [
            ("paid", status.HTTP_400_BAD_REQUEST),
            ("pending", status.HTTP_409_CONFLICT),
            ("error", status.HTTP_503_SERVICE_UNAVAILABLE),
        ],
    )
    def test_delete_is_blocked_when_payment_cannot_be_cleared(
        self, auth_client, order, monkeypatch, payment_state, expected_status
    ):
        # The provider re-check says the attempt succeeded, is still in flight,
        # or cannot be reached. Deleting under those conditions could erase a
        # paid order, so the order must survive and the API must explain why.
        monkeypatch.setattr(
            "apps.orders.views.payment_state_before_delete",
            lambda _order: payment_state,
        )

        resp = auth_client.delete(_url(order))

        assert resp.status_code == expected_status
        assert "payment" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_placed_order_with_a_failed_payment_can_be_deleted(self, auth_client, order):
        # The attempt was made but never settled, so no money ever moved.
        Order.objects.filter(pk=order.pk).update(payment_status=PaymentStatus.FAILED)

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Order.objects.filter(pk=order.pk).exists()

    def test_placed_paid_order_cannot_be_deleted(self, auth_client, order):
        order, _ = mark_order_paid(order, "TGS-REF-PAID")

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "not yet paid" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_delivered_order_cannot_be_deleted(self, auth_client, order):
        order, _ = mark_order_paid(order, "TGS-REF-DELIVERED")
        Order.objects.filter(pk=order.pk).update(status=OrderStatus.DELIVERED)

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "not yet paid" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_cancelled_unpaid_order_cannot_be_deleted(self, auth_client, order):
        cancel_order(order)

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "not yet paid" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_cancelled_order_with_late_payment_cannot_be_deleted(self, auth_client, order):
        cancel_order(order)
        # The customer paid using a stale checkout tab after cancelling.
        mark_order_paid(order, "TGS-REF-LATE")

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "not yet paid" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_refunded_order_cannot_be_deleted(self, auth_client, order):
        # The money moved and was given back, so this is a real transaction
        # even though the order never left "placed".
        Order.objects.filter(pk=order.pk).update(payment_status=PaymentStatus.REFUNDED)

        resp = auth_client.delete(_url(order))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "not yet paid" in resp.data["detail"].lower()
        assert Order.objects.filter(pk=order.pk).exists()

    def test_the_delete_button_is_only_offered_for_placed_unpaid_orders(self, auth_client, order):
        # The flag the storefront uses to decide whether to show the button.
        detail = auth_client.get(_url(order))
        assert detail.data["can_delete"] is True

        mark_order_paid(order, "TGS-REF-PAID")
        Order.objects.filter(pk=order.pk).update(status=OrderStatus.DELIVERED)

        detail = auth_client.get(_url(order))
        assert detail.data["can_delete"] is False
