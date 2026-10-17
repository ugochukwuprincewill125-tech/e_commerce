"""The token-guarded maintenance endpoint that expires unpaid orders.

On Render's free tier there is no cron, so a scheduled GitHub workflow calls
this endpoint instead of the management command — un-paid orders must not hold
reserved stock hostage forever.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.cart.models import Cart, CartItem
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import create_order_from_cart, mark_order_paid

URL = "/api/orders/maintenance/release-unpaid/"


def _make_order(customer, product, *, age_hours=0):
    cart, _ = Cart.objects.get_or_create(user=customer)
    CartItem.objects.create(cart=cart, product=product, quantity=1)
    order = create_order_from_cart(
        customer,
        cart,
        {
            "first_name": "Test",
            "last_name": "Customer",
            "email": "customer@example.com",
            "phone": "08000000000",
            "delivery_method": "pickup",
            "pickup_location": "main-office",
        },
    )
    if age_hours:
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(hours=age_hours))
        order.refresh_from_db()
    return order


@pytest.mark.django_db
class TestReleaseUnpaidOrdersEndpoint:
    def test_hidden_without_token(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        resp = api_client.post(URL)
        assert resp.status_code == 404

    def test_hidden_with_wrong_token(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        resp = api_client.post(URL, HTTP_X_MAINTENANCE_TOKEN="guessed")
        assert resp.status_code == 404

    def test_hidden_when_not_configured(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = ""
        resp = api_client.post(URL, HTTP_X_MAINTENANCE_TOKEN="anything")
        assert resp.status_code == 404

    def test_releases_expired_unpaid_orders_and_restores_stock(self, api_client, customer, product, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        settings.UNPAID_ORDER_EXPIRY_HOURS = 48
        stale = _make_order(customer, product, age_hours=72)
        fresh = _make_order(customer, product, age_hours=1)

        resp = api_client.post(URL, HTTP_X_MAINTENANCE_TOKEN="top-secret")
        assert resp.status_code == 200
        assert resp.data["cancelled"] == 1

        stale.refresh_from_db()
        assert stale.status == OrderStatus.CANCELLED
        assert stale.stock_restored is True
        fresh.refresh_from_db()
        assert fresh.status == OrderStatus.PLACED
        product.refresh_from_db()
        # Two orders reserved one unit each; only the fresh one still holds its unit.
        assert product.stock_quantity == 49

    def test_paid_orders_are_never_expired(self, api_client, customer, product, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        order = _make_order(customer, product, age_hours=720)
        mark_order_paid(order, "TGS-REF-PAID")

        resp = api_client.post(URL, HTTP_X_MAINTENANCE_TOKEN="top-secret")
        assert resp.status_code == 200
        assert resp.data["cancelled"] == 0
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.PAID
        assert order.status != OrderStatus.CANCELLED


@pytest.mark.django_db
class TestReleaseStaleUnpaidOrdersService:
    def test_service_returns_count(self, customer, product, settings):
        from apps.orders.services import release_stale_unpaid_orders

        settings.UNPAID_ORDER_EXPIRY_HOURS = 48
        _make_order(customer, product, age_hours=96)
        assert release_stale_unpaid_orders() == 1
        # Second run: nothing left to expire (idempotent).
        assert release_stale_unpaid_orders() == 0
