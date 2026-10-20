"""Application events that produce transactional email.

Nothing here sends directly. Each function builds a plain context snapshot and
hands it to the outbox, which renders the message and schedules delivery after
the surrounding database transaction commits.
"""
import hashlib
import logging
import uuid
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from apps.core.store import COMPANY

from .services import enqueue_email

logger = logging.getLogger(__name__)

MONEY = "₦"


def naira(value):
    try:
        amount = Decimal(value or 0)
    except (TypeError, ValueError):
        amount = Decimal("0")
    return f"{MONEY}{amount:,.2f}"


def _local(value, fmt="%d %b %Y, %I:%M %p"):
    if not value:
        return ""
    try:
        return timezone.localtime(value).strftime(fmt)
    except (ValueError, AttributeError):
        return ""


def _base_context():
    return {
        "site_url": settings.FRONTEND_URL,
        "year": timezone.localdate().year,
    }


def _url_hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]


def _user_context(user):
    return {
        **_base_context(),
        "customer_name": user.full_name or user.first_name or "there",
        "first_name": user.first_name or "there",
        "email": user.email,
        "account_url": f"{settings.FRONTEND_URL}/account",
    }


def _order_items(order):
    return [
        {
            "name": item.product_name,
            "variant": item.variant_label,
            "quantity": item.quantity,
            "unit_price": naira(item.unit_price),
            "line_total": naira(item.total_price),
            "review_url": (
                f"{settings.FRONTEND_URL}/products/{item.product.slug}"
                if item.product_id and item.product and item.product.slug
                else ""
            ),
        }
        for item in order.items.all()
    ]


def _pickup_details(code):
    """Turn a pickup location code (``main-office``) into a display label + address lines."""
    for location in COMPANY.get("locations", []):
        if location.get("id") == code:
            return location.get("label") or "Main Office", location.get("lines") or []
    label = (code or "Main Office").replace("-", " ").title()
    return label, []


def _order_context(order):
    pickup = order.delivery_method == "pickup"
    status = order.status
    delivery_verb = "has been picked up" if status == "picked_up" else "has been delivered"
    pickup_label, pickup_lines = _pickup_details(order.pickup_location)
    return {
        **_base_context(),
        "customer_name": order.customer_name,
        "first_name": order.first_name,
        "order_number": order.order_number,
        "order_date": _local(order.created_at),
        "order_url": f"{settings.FRONTEND_URL}/account/orders/{order.order_number}",
        "receipt_url": f"{settings.FRONTEND_URL}/account/receipts/{order.order_number}",
        "items": _order_items(order),
        "subtotal": naira(order.subtotal),
        "shipping_fee": naira(order.shipping_fee),
        "discount": naira(order.discount),
        "has_discount": Decimal(order.discount or 0) > 0,
        "total": naira(order.total),
        "coupon_code": order.coupon_code,
        "is_pickup": pickup,
        "delivery_method": order.get_delivery_method_display(),
        "delivery_address": order.formatted_address(),
        "pickup_location": order.pickup_location,
        "pickup_location_label": pickup_label,
        "pickup_address_lines": pickup_lines,
        "customer_note": order.customer_note,
        "payment_status": order.get_payment_status_display(),
        "payment_status_key": order.payment_status,
        "payment_reference": order.payment_reference,
        "paid_at": _local(order.paid_at),
        "order_status": status,
        "order_status_label": order.get_status_display(),
        "carrier": order.carrier,
        "tracking_number": order.tracking_number,
        "shipped_at": _local(order.shipped_at),
        "delivered_at": _local(order.delivered_at),
        "delivery_verb": delivery_verb,
        "refund_amount": naira(order.refund_amount) if order.refund_amount is not None else "",
        "refund_reference": order.refund_reference,
        "refund_reason": order.refund_reason,
        "refunded_at": _local(order.refunded_at),
    }


def send_welcome_email(user, verify_url=""):
    return enqueue_email(
        template="welcome",
        to_email=user.email,
        to_name=user.full_name,
        context={
            **_user_context(user),
            "verify_url": verify_url,
            "preheader": (
                "Welcome — confirm your email to finish setting up your account."
                if verify_url
                else "Welcome to Timeline Gadgets."
            ),
        },
        idempotency_key=f"welcome:{user.pk}",
        event="user.welcome",
        metadata={"user_id": user.pk},
    )


def send_verification_email(user, verify_url):
    return enqueue_email(
        template="verify_email",
        to_email=user.email,
        to_name=user.full_name,
        context={
            **_user_context(user),
            "verify_url": verify_url,
            "preheader": "Confirm your email address for Timeline Gadgets.",
        },
        idempotency_key=f"verify-email:{user.pk}:{_url_hash(verify_url)}",
        event="user.verify_email",
        metadata={"user_id": user.pk},
    )


def send_password_reset_email(user, reset_url):
    return enqueue_email(
        template="password_reset",
        to_email=user.email,
        to_name=user.full_name,
        context={
            **_user_context(user),
            "reset_url": reset_url,
            "preheader": "Use the secure link below to choose a new password.",
        },
        idempotency_key=f"password-reset:{user.pk}:{_url_hash(reset_url)}",
        event="user.password_reset",
        metadata={"user_id": user.pk},
    )


def send_contact_notification(message):
    """Email the store inbox when a customer uses the contact form.

    The message is also stored in ``ContactMessage`` for the admin Messages
    tab. This notification is the copy that lands in the team's inbox.
    """
    recipient = (settings.CONTACT_NOTIFICATION_EMAIL or "").strip()
    if not recipient:
        logger.info("No CONTACT_NOTIFICATION_EMAIL configured; contact message %s stored only.", message.pk)
        return None
    return enqueue_email(
        template="contact_message",
        to_email=recipient,
        to_name="Timeline Gadgets",
        context={
            **_base_context(),
            "customer_name": message.name,
            "customer_email": message.email,
            "customer_phone": message.phone or "Not provided",
            "subject": message.subject,
            "message": message.message,
            "submitted_at": _local(message.created_at),
            "message_url": f"{settings.FRONTEND_URL}/admin/messages",
            "preheader": f"New contact message from {message.name}: {message.subject}",
        },
        idempotency_key=f"contact-message:{message.pk}",
        event="contact.message",
        metadata={"contact_message_id": message.pk},
    )


def send_order_confirmation(order):
    return enqueue_email(
        template="order_confirmation",
        to_email=order.email,
        to_name=order.customer_name,
        context={
            **_order_context(order),
            "preheader": f"We received order {order.order_number}.",
        },
        idempotency_key=f"order-confirmation:{order.pk}",
        event="order.created",
        metadata={"order_id": order.pk, "order_number": order.order_number},
    )


def send_payment_confirmation(order, reference):
    context = {
        **_order_context(order),
        "payment_reference": reference,
        "preheader": f"Payment received for order {order.order_number}.",
        "receipt_code": "",
    }
    try:
        # Local import keeps the module import graph free of any ordering
        # surprises; the code is derived from the order, never stored.
        from apps.orders.receipt_codes import verification_code

        context["receipt_code"] = verification_code(order)
    except Exception:  # pragma: no cover - receipts still send without a code
        logger.warning("Could not compute receipt code for order %s", order.pk, exc_info=True)
    return enqueue_email(
        template="payment_confirmation",
        to_email=order.email,
        to_name=order.customer_name,
        context=context,
        idempotency_key=f"payment-confirmation:{order.pk}:{reference}",
        event="payment.confirmed",
        metadata={"order_id": order.pk, "order_number": order.order_number, "reference": reference},
    )


# Every customer-visible fulfilment milestone maps to a template. ``placed``
# and ``payment_confirmed`` are intentionally absent: checkout sends the order
# confirmation and a verified payment sends the payment confirmation (receipt),
# so those transitions are already covered without a second email.
STATUS_EMAILS = {
    "processing": "order_processing",
    "ready_for_delivery": "order_ready",
    "ready_for_pickup": "order_ready",
    "shipped": "order_shipped",
    "delivered": "order_delivered",
    "picked_up": "order_delivered",
}

STATUS_PREHEADERS = {
    "processing": "Order {number} is being prepared by our team.",
    "ready_for_delivery": "Order {number} is packed and ready to go out.",
    "ready_for_pickup": "Order {number} is ready for pickup at our store.",
    "shipped": "Order {number} is on its way.",
}


def send_order_status_email(order, previous_status=None):
    """Send an update for every customer-visible order status change.

    Idempotent per (order, status): repeated events for the same status are
    ignored, while each new milestone sends its own email.
    """
    if previous_status == order.status:
        return None
    template = STATUS_EMAILS.get(order.status)
    if not template:
        return None
    context = _order_context(order)
    preheader = STATUS_PREHEADERS.get(order.status) or (
        f"Order {order.order_number} {context['delivery_verb']}."
    )
    return enqueue_email(
        template=template,
        to_email=order.email,
        to_name=order.customer_name,
        context={
            **context,
            "preheader": preheader.format(number=order.order_number),
        },
        idempotency_key=f"order-status:{order.pk}:{order.status}",
        event=f"order.{order.status}",
        metadata={"order_id": order.pk, "order_number": order.order_number, "status": order.status},
    )


def send_order_cancelled(order, reason=""):
    return enqueue_email(
        template="order_cancelled",
        to_email=order.email,
        to_name=order.customer_name,
        context={
            **_order_context(order),
            "cancel_reason": reason or "The order was cancelled.",
            "preheader": f"Order {order.order_number} has been cancelled.",
        },
        idempotency_key=f"order-cancelled:{order.pk}",
        event="order.cancelled",
        metadata={"order_id": order.pk, "order_number": order.order_number},
    )


def send_order_refunded(order, *, amount=None, reference="", is_partial=False, note="", idempotency_suffix=""):
    refund_amount = amount if amount is not None else (order.refund_amount or order.total)
    suffix = idempotency_suffix or reference or _local(order.refunded_at, "%Y%m%d%H%M%S") or "manual"
    return enqueue_email(
        template="order_refunded",
        to_email=order.email,
        to_name=order.customer_name,
        context={
            **_order_context(order),
            "refund_amount": naira(refund_amount),
            "refund_reference": reference or order.refund_reference,
            "refund_reason": order.refund_reason,
            "refund_is_full": not is_partial,
            "refund_note": note,
            "preheader": f"A refund has been processed for order {order.order_number}.",
        },
        idempotency_key=f"order-refund:{order.pk}:{suffix}",
        event="order.refunded",
        metadata={
            "order_id": order.pk,
            "order_number": order.order_number,
            "refund_reference": reference or order.refund_reference,
            "partial": bool(is_partial),
        },
    )


def send_test_email(to_email, name=""):
    """Used by ``manage.py send_test_email`` and the setup walkthrough."""
    context = {
        **_base_context(),
        "customer_name": name or "there",
        "first_name": name or "there",
        "sender_name": settings.BREVO_SENDER_NAME,
        "sender_email": settings.BREVO_SENDER_EMAIL,
        "brevo_configured": bool(settings.BREVO_API_KEY),
        "test_mode": bool(settings.EMAIL_TEST_MODE),
        "test_recipient": settings.EMAIL_TEST_RECIPIENT,
        "preheader": "A test of the Timeline Gadgets transactional email configuration.",
    }
    return enqueue_email(
        template="system_test",
        to_email=to_email,
        to_name=name,
        context=context,
        idempotency_key=f"system-test:{uuid.uuid4().hex}",
        event="system.test",
        metadata={"test": True},
    )
