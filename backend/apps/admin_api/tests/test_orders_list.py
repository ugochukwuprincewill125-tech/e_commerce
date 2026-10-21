"""The admin order list/detail must serialize the reminder fields safely."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from apps.orders.models import Order

pytestmark = pytest.mark.django_db


def test_admin_orders_list_includes_payment_reminder_fields(staff_client, paid_order):
    order = paid_order
    Order.objects.filter(pk=order.pk).update(
        payment_reminder_sent_at=timezone.now() - timedelta(minutes=10)
    )

    resp = staff_client.get("/api/admin-api/orders/")

    assert resp.status_code == status.HTTP_200_OK
    row = resp.data["results"][0]
    assert row["payment_reminder_sent_at"] is not None
    assert row["auto_delete_at"] is not None


def test_admin_order_list_returns_null_deadline_before_reminder(staff_client, paid_order):
    resp = staff_client.get("/api/admin-api/orders/")

    assert resp.status_code == status.HTTP_200_OK
    row = resp.data["results"][0]
    assert row["payment_reminder_sent_at"] is None
    assert row["auto_delete_at"] is None


def test_admin_order_detail_serializes_reminder_fields(staff_client, paid_order):
    resp = staff_client.get(f"/api/admin-api/orders/{paid_order.pk}/")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["payment_reminder_sent_at"] is None
    assert resp.data["auto_delete_at"] is None
