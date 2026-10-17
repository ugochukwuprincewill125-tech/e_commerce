"""Payment lifecycle services shared by the storefront and the admin APIs.

Everything money-related funnels through here so the storefront refund view
and the admin refund button cannot drift apart: the same validation, the same
Paystack call, and the same bookkeeping happen no matter which door the staff
member came through.
"""
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.orders.models import Order, PaymentStatus

from . import paystack
from .models import Payment

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")
MIN_REFUND = Decimal("0.01")


@transaction.atomic
def refund_order(order, *, amount, reason="", note="", reference="", restore_stock_items=False):
    """Refund part or all of a paid order, in sync with Paystack.

    * Row-locks the order, so two refund clicks (or a refund racing the
      ``refund.processed`` webhook) are serialised instead of double-counted.
    * Money actually moves when the order was paid through Paystack: the
      refund is requested from the gateway and its refund id is stored on the
      order. For orders settled outside Paystack (bank transfer, test mode,
      staff marked them paid) the refund is recorded as a manual one.
    * Partial refunds accumulate: ``order.refund_amount`` grows and the order
      only becomes ``refunded`` once the whole paid amount is returned. Until
      then it stays ``paid`` with the remainder still refundable.

    Returns ``(order, payment_or_None, gateway_data_or_None)``.
    """
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.payment_status != PaymentStatus.PAID:
        raise ValidationError({"detail": "Only a paid order can be refunded."})

    payment = (
        Payment.objects.select_for_update()
        .filter(order=order, status=Payment.Status.SUCCESS, provider=Payment.Provider.PAYSTACK)
        .first()
    )

    amount = Decimal(amount)
    paid_amount = payment.amount if payment else order.total
    already_refunded = order.refund_amount or ZERO
    remaining = paid_amount - already_refunded

    if amount < MIN_REFUND:
        raise ValidationError({"detail": f"Refund amount must be at least ₦{MIN_REFUND}."})
    if amount > remaining:
        raise ValidationError(
            {"detail": f"Refund amount ({amount}) cannot exceed the remaining refundable amount ({remaining})."}
        )

    gateway_data = None
    gateway_reference = ""
    if payment and settings.PAYSTACK_SECRET_KEY:
        # Raises PaystackError on any gateway failure — nothing is recorded and
        # the transaction rolls back, so local records never claim a refund
        # that Paystack rejected.
        gateway_data = paystack.refund_transaction(payment.reference, amount)
        gateway_reference = str(gateway_data.get("id") or "")
        logger.info(
            "Paystack refund initiated for order %s: ₦%s (ref %s)",
            order.order_number, amount, gateway_reference or "unknown",
        )

    # A refund.processed webhook can land while the gateway call above is in
    # flight. If it already recorded this exact refund, do not count it twice.
    already_counted = bool(gateway_reference) and order.refund_reference == gateway_reference
    refunded_total = already_refunded if already_counted else already_refunded + amount

    order.refund_amount = refunded_total
    order.refund_reason = reason or order.refund_reason
    order.refund_reference = gateway_reference or reference or order.refund_reference
    order.refunded_at = timezone.now()
    if refunded_total >= paid_amount:
        order.payment_status = PaymentStatus.REFUNDED
    order.save(
        update_fields=[
            "payment_status", "refund_amount", "refund_reason",
            "refund_reference", "refunded_at", "updated_at",
        ]
    )

    if payment:
        payment.refund_note = (note or reason)[:500]
        payment.save(update_fields=["refund_note"])

    if restore_stock_items and not order.stock_restored:
        from apps.orders.services import restore_stock  # local import: avoids a cycle

        restore_stock(order)

    if gateway_data is not None:
        where = f"via Paystack (refund ref {gateway_reference})" if gateway_reference else "via Paystack"
    elif payment:
        where = "recorded as a manual refund — Paystack is not configured"
    else:
        where = "recorded as a manual refund — no Paystack transaction on file"
    remaining_after = paid_amount - refunded_total
    suffix = f" {remaining_after} still refundable." if remaining_after > ZERO else ""
    order.add_history(order.status, f"Refunded ₦{amount} {where}. {reason}".strip() + suffix)

    return order, payment, gateway_data
