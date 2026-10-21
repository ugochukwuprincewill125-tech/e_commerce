"""Abandoned-checkout follow-up: reminder email, grace period and auto-deletion.

The flow under test:
* 15 minutes after checkout, an unpaid order gets exactly one reminder;
* 60 minutes after that reminder, an order still unpaid is permanently
  deleted (customer + admin) and its reserved stock is released;
* an order whose Paystack payment is successful, pending, or unverifiable is
  never deleted - deletion is deferred to the next sweep instead.
"""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cart.models import Cart, CartItem
from apps.notifications.models import TransactionalEmail
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import (
    mark_order_paid,
    process_unpaid_order_followups,
)
from apps.payments.models import Payment

User = get_user_model()
PROCESS_URL = "/api/orders/maintenance/process-unpaid/"


def _make_order(customer, product, *, age_minutes=0):
    cart, _ = Cart.objects.get_or_create(user=customer)
    CartItem.objects.create(cart=cart, product=product, quantity=1)
    from apps.orders.services import create_order_from_cart

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
    if age_minutes:
        Order.objects.filter(pk=order.pk).update(
            created_at=timezone.now() - timedelta(minutes=age_minutes)
        )
        order.refresh_from_db()
    return order


def _set_reminder_age(order, minutes):
    Order.objects.filter(pk=order.pk).update(
        payment_reminder_sent_at=timezone.now() - timedelta(minutes=minutes)
    )
    order.refresh_from_db()


@pytest.mark.django_db
class TestPaymentReminder:
    @override_settings(UNPAID_ORDER_REMINDER_MINUTES=15, UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_reminder_is_sent_once_after_fifteen_minutes(self, customer, product):
        order = _make_order(customer, product, age_minutes=16)

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["reminded"] == 1
        order.refresh_from_db()
        assert order.payment_reminder_sent_at is not None
        assert order.auto_delete_at == order.payment_reminder_sent_at + timedelta(minutes=60)

        reminder = TransactionalEmail.objects.get(template="payment_reminder")
        assert reminder.recipient_email == order.email
        assert order.order_number in reminder.subject
        assert "60 minutes" in reminder.text_body
        assert order.order_number in reminder.text_body

        # A second sweep must not send the reminder again.
        second = process_unpaid_order_followups(cancel_stale_legacy=False)
        assert second["reminded"] == 0
        assert TransactionalEmail.objects.filter(template="payment_reminder").count() == 1

    def test_reminder_waits_until_the_configured_delay(self, customer, product):
        _make_order(customer, product, age_minutes=5)

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["reminded"] == 0
        assert not TransactionalEmail.objects.filter(template="payment_reminder").exists()

    def test_paid_orders_never_get_a_reminder(self, customer, product):
        order = _make_order(customer, product, age_minutes=30)
        mark_order_paid(order, "TGS-REF-PAID")

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["reminded"] == 0
        assert not TransactionalEmail.objects.filter(template="payment_reminder").exists()

    def test_failed_payment_still_gets_a_reminder(self, customer, product):
        order = _make_order(customer, product, age_minutes=30)
        Order.objects.filter(pk=order.pk).update(payment_status=PaymentStatus.FAILED)

        assert process_unpaid_order_followups(cancel_stale_legacy=False)["reminded"] == 1


@pytest.mark.django_db
class TestAutomaticDeletion:
    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_order_is_deleted_after_grace_period_and_stock_restored(self, customer, product):
        order = _make_order(customer, product, age_minutes=80)
        _set_reminder_age(order, 61)
        product.refresh_from_db()
        stock_before = product.stock_quantity
        order_number = order.order_number

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["deleted"] == 1
        assert not Order.objects.filter(pk=order.pk).exists()
        product.refresh_from_db()
        assert product.stock_quantity == stock_before + 1

        goodbye = TransactionalEmail.objects.get(template="order_auto_deleted")
        assert goodbye.recipient_email == order.email
        assert order_number in goodbye.subject
        assert "deleted" in goodbye.text_body.lower()
        assert "welcome to place a new order" in goodbye.text_body.lower()

    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_order_is_kept_until_the_full_grace_period_has_passed(self, customer, product):
        order = _make_order(customer, product, age_minutes=40)
        _set_reminder_age(order, 30)

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["deleted"] == 0
        assert Order.objects.filter(pk=order.pk).exists()
        assert not TransactionalEmail.objects.filter(template="order_auto_deleted").exists()

    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_paid_order_is_never_deleted(self, customer, product):
        order = _make_order(customer, product, age_minutes=120)
        _set_reminder_age(order, 120)
        mark_order_paid(order, "TGS-REF-LATE")

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["deleted"] == 0
        assert Order.objects.filter(pk=order.pk).exists()
        assert not TransactionalEmail.objects.filter(template="order_auto_deleted").exists()

    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_failed_payment_is_deleted_after_grace_period(self, customer, product):
        order = _make_order(customer, product, age_minutes=120)
        _set_reminder_age(order, 90)
        Order.objects.filter(pk=order.pk).update(payment_status=PaymentStatus.FAILED)

        assert process_unpaid_order_followups(cancel_stale_legacy=False)["deleted"] == 1
        assert not Order.objects.filter(pk=order.pk).exists()

    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_pending_paystack_payment_defers_deletion(self, customer, product, monkeypatch):
        order = _make_order(customer, product, age_minutes=120)
        _set_reminder_age(order, 90)
        payment = Payment.objects.create(
            order=order,
            provider=Payment.Provider.PAYSTACK,
            reference="TGS-REF-PENDING",
            amount=order.total,
            status=Payment.Status.INITIALIZED,
        )

        def fake_reconcile(_order):
            return False, [(payment, "pending")]

        monkeypatch.setattr(
            "apps.payments.services.reconcile_order_payments", fake_reconcile
        )

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["deleted"] == 0
        assert result["deferred"] == 1
        assert Order.objects.filter(pk=order.pk).exists()
        assert not TransactionalEmail.objects.filter(template="order_auto_deleted").exists()

    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_unverifiable_payment_defers_deletion(self, customer, product, monkeypatch):
        order = _make_order(customer, product, age_minutes=120)
        _set_reminder_age(order, 90)
        payment = Payment.objects.create(
            order=order,
            provider=Payment.Provider.PAYSTACK,
            reference="TGS-REF-ERROR",
            amount=order.total,
            status=Payment.Status.INITIALIZED,
        )
        monkeypatch.setattr(
            "apps.payments.services.reconcile_order_payments",
            lambda _order: (False, [(payment, "error")]),
        )

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["deleted"] == 0
        assert result["deferred"] == 1
        assert Order.objects.filter(pk=order.pk).exists()

    @override_settings(UNPAID_ORDER_DELETION_GRACE_MINUTES=60)
    def test_a_just_confirmed_payment_prevents_deletion(self, customer, product, monkeypatch):
        order = _make_order(customer, product, age_minutes=120)
        _set_reminder_age(order, 90)

        def confirm(_order):
            mark_order_paid(_order, "TGS-REF-JUST-PAID")
            return True, []

        monkeypatch.setattr(
            "apps.payments.services.reconcile_order_payments", confirm
        )

        result = process_unpaid_order_followups(cancel_stale_legacy=False)

        assert result["deleted"] == 0
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.PAID
        assert Order.objects.filter(pk=order.pk).exists()


@pytest.mark.django_db
class TestFollowUpMaintenanceEndpoint:
    def test_hidden_without_a_valid_token(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        assert api_client.post(PROCESS_URL).status_code == 404
        assert api_client.post(PROCESS_URL, HTTP_X_MAINTENANCE_TOKEN="wrong").status_code == 404

    def test_hidden_when_not_configured(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = ""
        assert api_client.post(PROCESS_URL, HTTP_X_MAINTENANCE_TOKEN="anything").status_code == 404

    @override_settings(UNPAID_ORDER_REMINDER_MINUTES=15)
    def test_runs_the_sweep_with_a_valid_token(self, api_client, customer, product, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        _make_order(customer, product, age_minutes=16)

        resp = api_client.post(PROCESS_URL, HTTP_X_MAINTENANCE_TOKEN="top-secret")

        assert resp.status_code == 200
        assert resp.data["reminded"] == 1
        assert resp.data["deleted"] == 0
        assert set(resp.data) == {"reminded", "deleted", "deferred", "cancelled_legacy"}


@pytest.mark.django_db
class TestCustomerDeletionIsVisibleToAdmin:
    def test_deleted_unpaid_order_disappears_from_the_admin_order_list(self, auth_client, order):
        staff = User.objects.create_superuser(
            email="admin@example.com",
            first_name="Admin",
            last_name="User",
            password="AdminPass123!",
            email_verified=True,
        )
        from rest_framework_simplejwt.tokens import AccessToken

        staff_client = APIClient()
        staff_client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(staff)}"
        )

        before = staff_client.get("/api/admin-api/orders/")
        assert before.status_code == 200
        assert order.order_number in {row["order_number"] for row in before.data["results"]}

        resp = auth_client.delete(f"/api/orders/{order.order_number}/")
        assert resp.status_code == 204

        after = staff_client.get("/api/admin-api/orders/")
        assert after.status_code == 200
        assert order.order_number not in {row["order_number"] for row in after.data["results"]}
        assert not Order.objects.filter(pk=order.pk).exists()
