"""End-to-end checks: business events produce exactly one correct email."""
import pytest
from django.db import transaction
from django.utils import timezone

from apps.cart.models import Cart, CartItem
from apps.notifications.events import STATUS_EMAILS, send_payment_confirmation
from apps.notifications.models import TransactionalEmail
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import cancel_order, create_order_from_cart, mark_order_paid
from apps.payments.models import Payment
from apps.payments.services import record_gateway_refund

pytestmark = pytest.mark.django_db

REGISTER = "/api/auth/register/"
PASSWORD_RESET = "/api/auth/password-reset/"


def _make_order(customer, product):
    cart = Cart.objects.create(user=customer)
    CartItem.objects.create(cart=cart, product=product, quantity=1)
    return create_order_from_cart(
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


def _emails(template):
    return TransactionalEmail.objects.filter(template=template)


class TestAccountEmails:
    def test_registration_queues_welcome_and_verification_emails(
        self, api_client, mailoutbox, django_capture_on_commit_callbacks
    ):
        payload = {
            "first_name": "Ada",
            "last_name": "Okafor",
            "email": "ada.okafor@example.com",
            "phone": "08031234567",
            "password": "StrongPass123!",
            "confirm_password": "StrongPass123!",
        }
        with django_capture_on_commit_callbacks(execute=True):
            resp = api_client.post(REGISTER, payload, format="json")

        assert resp.status_code == 201
        welcome = _emails("welcome").get()
        assert welcome.recipient_email == "ada.okafor@example.com"
        assert "Ada" in welcome.subject or "ada" in welcome.html_body.lower()
        assert "/verify-email/" in welcome.html_body

        verify = _emails("verify_email").get()
        assert verify.recipient_email == "ada.okafor@example.com"
        assert "/verify-email/" in verify.html_body
        assert len(mailoutbox) == 2

    def test_password_reset_queues_an_email_for_known_addresses_only(
        self, api_client, customer, mailoutbox, django_capture_on_commit_callbacks
    ):
        with django_capture_on_commit_callbacks(execute=True):
            known = api_client.post(PASSWORD_RESET, {"email": customer.email}, format="json")
            unknown = api_client.post(PASSWORD_RESET, {"email": "nobody@example.com"}, format="json")

        assert known.status_code == 200
        assert unknown.status_code == 200
        assert _emails("password_reset").count() == 1
        assert len(mailoutbox) == 1


class TestOrderEmails:
    def test_checkout_queues_the_order_confirmation(self, customer, product, mailoutbox, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            order = _make_order(customer, product)

        record = _emails("order_confirmation").get()
        assert record.idempotency_key == f"order-confirmation:{order.pk}"
        assert order.order_number in record.subject
        assert "Test Widget" in record.html_body
        assert len(mailoutbox) == 1

    def test_payment_confirmation_is_sent_once_per_reference(self, order, mailoutbox, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            mark_order_paid(order, "TGS-REF-1")
            send_payment_confirmation(order, "TGS-REF-1")
            send_payment_confirmation(order, "TGS-REF-1")

        assert _emails("payment_confirmation").count() == 1
        assert len(mailoutbox) == 1
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.PAID

    def test_payment_confirmation_is_a_receipt_with_verifiable_code(
        self, order, mailoutbox, django_capture_on_commit_callbacks
    ):
        from apps.orders.receipt_codes import verification_code

        with django_capture_on_commit_callbacks(execute=True):
            mark_order_paid(order, "TGS-REF-2")

        order.refresh_from_db()
        record = _emails("payment_confirmation").get()
        code = verification_code(order)
        assert code in record.html_body
        assert code in record.text_body
        assert f"/account/receipts/{order.order_number}" in record.html_body
        assert "Receipt code" in record.html_body

    def test_cancellation_email_is_sent_once(self, order, mailoutbox, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            cancel_order(order, note="Customer changed their mind.")
            cancel_order(order, note="Customer changed their mind.")

        assert _emails("order_cancelled").count() == 1
        assert "Customer changed their mind." in _emails("order_cancelled").get().html_body
        assert len(mailoutbox) == 1


class TestRefundEmails:
    def _successful_payment(self, order):
        payment = Payment.objects.create(
            order=order,
            provider=Payment.Provider.PAYSTACK,
            reference=f"{order.order_number}-REFUND",
            amount=order.total,
            currency="NGN",
            status=Payment.Status.SUCCESS,
            verified_at=timezone.now(),
        )
        mark_order_paid(order, payment.reference)
        return payment

    def test_a_refund_webhook_sends_one_email_even_when_redelivered(self, order, mailoutbox, django_capture_on_commit_callbacks):
        payment = self._successful_payment(order)
        data = {"id": 987654, "amount": int(order.total * 100), "currency": "NGN", "status": "processed"}

        with django_capture_on_commit_callbacks(execute=True), transaction.atomic():
            record_gateway_refund(payment, data)
            record_gateway_refund(payment, data)  # Paystack redelivery

        assert _emails("order_refunded").count() == 1
        assert len(mailoutbox) == 1
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.REFUNDED
        assert order.refund_amount == order.total

    def test_partial_refund_marks_the_email_as_partial(self, order, mailoutbox, django_capture_on_commit_callbacks):
        payment = self._successful_payment(order)
        half = int(order.total * 50)

        with django_capture_on_commit_callbacks(execute=True), transaction.atomic():
            record_gateway_refund(payment, {"id": 111, "amount": half, "currency": "NGN"})

        record = _emails("order_refunded").get()
        assert record.metadata["partial"] is True
        order.refresh_from_db()
        assert order.payment_status == PaymentStatus.PAID  # not fully refunded yet


class TestStaffStatusEmails:
    def test_shipping_an_order_emails_the_customer(self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.SHIPPED, "note": "Left the warehouse."}, format="json")

        assert resp.status_code == 200
        assert _emails("order_shipped").count() == 1
        assert len(mailoutbox) == 1

    def test_processing_emails_the_customer(self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.PROCESSING}, format="json")

        assert resp.status_code == 200
        record = _emails("order_processing").get()
        assert order.order_number in record.subject
        assert len(mailoutbox) == 1

    def test_ready_for_delivery_emails_the_customer(self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.READY_FOR_DELIVERY}, format="json")

        assert resp.status_code == 200
        record = _emails("order_ready").get()
        assert "ready for delivery" in record.subject.lower()
        assert len(mailoutbox) == 1

    def test_ready_for_pickup_emails_the_customer(
        self, staff_client, customer, product, mailoutbox, django_capture_on_commit_callbacks
    ):
        pickup_order = _make_order(customer, product)
        url = f"/api/admin-api/orders/{pickup_order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.READY_FOR_PICKUP}, format="json")

        assert resp.status_code == 200
        record = _emails("order_ready").get()
        assert "ready for pickup" in record.subject.lower()
        assert "Computer Village" in record.html_body  # store address is included
        assert len(mailoutbox) == 1

    def test_repeated_status_changes_do_not_resend(self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            staff_client.patch(url, {"status": OrderStatus.PROCESSING}, format="json")
            # Same status again is a no-op; moving onward and back also must
            # not produce a second "processing" email.
            staff_client.patch(url, {"status": OrderStatus.PROCESSING}, format="json")
            staff_client.patch(url, {"status": OrderStatus.READY_FOR_DELIVERY}, format="json")
            staff_client.patch(url, {"status": OrderStatus.PROCESSING}, format="json")

        assert _emails("order_processing").count() == 1
        assert _emails("order_ready").count() == 1

    def test_payment_confirmed_status_does_not_duplicate_the_payment_email(
        self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks
    ):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.PAYMENT_CONFIRMED}, format="json")

        assert resp.status_code == 200
        # The receipt/payment-confirmation email is owned by the payment flow
        # (`mark_order_paid`), so a bare status move must not email again.
        assert not TransactionalEmail.objects.filter(template__in=list(STATUS_EMAILS.values())).exists()
        assert mailoutbox == []

    def test_marking_tracking_as_shipped_emails_once(
        self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks
    ):
        url = f"/api/admin-api/orders/{order.pk}/tracking/"
        payload = {"carrier": "GIG Logistics", "tracking_number": "GIG-123", "mark_shipped": True}
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, payload, format="json")
            # Saving tracking details again must not resend the shipped email.
            staff_client.patch(url, payload, format="json")

        assert resp.status_code == 200
        record = _emails("order_shipped").get()
        assert "GIG-123" in record.html_body
        assert record.status == TransactionalEmail.Status.SENT


class TestMaintenanceRetryEndpoint:
    URL = "/api/emails/maintenance/retry/"

    def test_hidden_without_token(self, api_client, settings):
        settings.MAINTENANCE_TOKEN = "top-secret"
        assert api_client.post(self.URL).status_code == 404

    def test_retries_due_messages_with_the_token(self, api_client, settings, mailoutbox):
        settings.MAINTENANCE_TOKEN = "top-secret"
        TransactionalEmail.objects.create(
            idempotency_key="due-1",
            template="system_test",
            recipient_email="retry@example.com",
            subject="Due",
            html_body="<p>Due</p>",
            text_body="Due",
            status=TransactionalEmail.Status.PENDING,
            next_retry_at=timezone.now(),
        )
        resp = api_client.post(self.URL, HTTP_X_MAINTENANCE_TOKEN="top-secret")
        assert resp.status_code == 200
        assert resp.data["sent"] == 1
        assert len(mailoutbox) == 1


class TestOrderStatusGuard:
    def test_delivered_status_updates_the_order_and_emails(self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.DELIVERED}, format="json")

        assert resp.status_code == 200
        assert _emails("order_delivered").count() == 1
        order.refresh_from_db()
        assert order.status == OrderStatus.DELIVERED
        assert order.delivered_at is not None

    def test_delivered_email_asks_for_a_review(self, staff_client, order, mailoutbox, django_capture_on_commit_callbacks):
        url = f"/api/admin-api/orders/{order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            staff_client.patch(url, {"status": OrderStatus.DELIVERED}, format="json")

        record = _emails("order_delivered").get()
        assert "thanks for shopping at" in record.html_body.lower()
        # Each purchased item links to its product page so the customer can
        # leave a review on the platform.
        assert "/products/test-widget" in record.html_body
        assert "/products/test-widget" in record.text_body

    def test_picked_up_email_thanks_the_customer_and_asks_for_a_review(
        self, staff_client, customer, product, mailoutbox, django_capture_on_commit_callbacks
    ):
        pickup_order = _make_order(customer, product)
        url = f"/api/admin-api/orders/{pickup_order.pk}/status/"
        with django_capture_on_commit_callbacks(execute=True):
            resp = staff_client.patch(url, {"status": OrderStatus.PICKED_UP}, format="json")

        assert resp.status_code == 200
        record = _emails("order_delivered").get()
        assert "picked up" in record.subject.lower()
        assert "thanks for shopping at" in record.html_body.lower()
        assert "/products/test-widget" in record.html_body
        pickup_order.refresh_from_db()
        assert pickup_order.status == OrderStatus.PICKED_UP
