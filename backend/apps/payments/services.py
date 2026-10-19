"""
Payment outcome reconciliation.

The views own the HTTP behaviour; this module owns what happens to our books
when a Paystack transaction reaches an outcome. Sharing it between the
redirect verify, the webhook, the on-demand order refresh, the scheduled
maintenance sweep and the management command means a payment can never be
confirmed by one path and missed by another.

Two shapes of "late money" motivate the reconciliation helpers:

* a customer cancels on the Paystack checkout while a charge is already in
  flight — Paystack can still settle it minutes later (and email a receipt);
* a webhook is delayed, redelivered, or (in local development) cannot reach
  us at all.

Both are healed by re-verifying open payments against Paystack and applying
``process_paystack_result`` — never by trusting the customer's browser.
"""
import logging
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.notifications.events import send_order_refunded
from apps.orders.models import Order, PaymentStatus
from apps.orders.services import mark_order_paid

from . import paystack
from .models import Payment

logger = logging.getLogger(__name__)

# How far back an attempt may be created and still be worth re-checking with
# Paystack. A bank transfer can settle long after the customer leaves the
# checkout, so "abandoned" in our books never gets the last word.
OPEN_ATTEMPT_WINDOW_HOURS = 168  # 7 days

# A single order never needs more than a handful of attempts re-checked.
MAX_REFRESH_ATTEMPTS = 5


def new_reference(order):
    return f"{order.order_number}-{secrets.token_hex(4).upper()}"


def test_mode_enabled():
    return settings.DEBUG and settings.PAYMENT_TEST_MODE


def _finalise_success(payment, data, channel=""):
    order = payment.order
    payment.status = Payment.Status.SUCCESS
    payment.verified_at = timezone.now()
    payment.channel = channel
    payment.gateway_response = str(data.get("gateway_response", ""))[:255]
    payment.raw_response = data
    payment.save()
    order, first_time = mark_order_paid(order, payment.reference)
    if not first_time and order.payment_reference != payment.reference:
        # A second, different charge landed on an order that was already paid.
        # The money is real and recorded, but it must go back: leave a loud
        # trail for staff instead of silently keeping the customer's cash.
        logger.warning(
            "Duplicate payment %s for already-paid order %s — refund needed.",
            payment.reference, order.order_number,
        )
        order.add_history(
            order.status,
            f"Duplicate payment of ₦{payment.amount} received (ref {payment.reference}) on an "
            f"order already paid with ref {order.payment_reference} — refund it from the Paystack dashboard.",
        )


def _close_payment(payment, new_status, data, *, fail_order=False):
    """Record a terminal outcome for a payment that is NOT successful."""
    payment.status = new_status
    payment.gateway_response = str(data.get("gateway_response", data.get("status", "")))[:255]
    payment.raw_response = data
    payment.save(update_fields=["status", "gateway_response", "raw_response"])
    if fail_order and payment.order.payment_status == PaymentStatus.PENDING:
        payment.order.payment_status = PaymentStatus.FAILED
        payment.order.save(update_fields=["payment_status", "updated_at"])


def process_paystack_result(payment, data):
    """Validate a Paystack transaction payload against our own records.

    Returns one of ``"success"``, ``"failed"``, ``"abandoned"`` or
    ``"pending"``. Anything Paystack has not finished with (``pending``,
    ``ongoing``, ``processing``, ``queued``, unknown values) leaves the
    payment initialized so a later webhook or retry can still complete it —
    marking those failed is how a customer gets scared into paying twice.
    """
    status_value = str(data.get("status") or "").lower()

    if status_value == "success":
        ok = (
            int(data.get("amount", 0)) == paystack.to_kobo(payment.amount)
            and str(data.get("currency", "NGN")).upper() == payment.currency
            and data.get("reference") == payment.reference
        )
        if ok:
            _finalise_success(payment, data, data.get("channel", ""))
            return "success"
        # A "success" that doesn't match our records is never trusted, and the
        # order is deliberately left pending until staff reconcile it.
        logger.warning(
            "Paystack reported success for %s that failed validation (amount/currency/reference mismatch).",
            payment.reference,
        )
        _close_payment(payment, Payment.Status.FAILED, data)
        return "failed"

    if status_value in ("failed", "reversed"):
        _close_payment(payment, Payment.Status.FAILED, data, fail_order=True)
        return "failed"

    if status_value == "abandoned":
        _close_payment(payment, Payment.Status.ABANDONED, data)
        return "abandoned"

    # Not final yet: keep the payment initialized and just record the glimpse.
    payment.gateway_response = str(data.get("gateway_response", status_value))[:255]
    payment.raw_response = data
    payment.save(update_fields=["gateway_response", "raw_response"])
    return "pending"


def record_gateway_refund(payment, data):
    """Reconcile a ``refund.processed`` webhook with our own records.

    Refunds are arranged by the support team (usually from the Paystack
    dashboard); this keeps the order's books in step with the money. Paystack
    redelivers webhooks, and a refund that is already recorded (its refund
    ``id`` is on the order) is recognised so it is never counted twice. The
    order only flips to ``refunded`` once the whole paid amount has come back.
    """
    # Read the order fresh (and lock it) instead of trusting a possibly stale
    # ``payment.order`` cache: a caller that just marked the order paid in the
    # same transaction must not be un-paid by this refund reconciliation.
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    refund_id = str(data.get("id") or "")
    amount_kobo = data.get("amount")
    already_counted = bool(refund_id) and order.refund_reference == refund_id

    accumulated = False
    refund_naira = None
    if not already_counted and isinstance(amount_kobo, (int, float)) and amount_kobo > 0:
        refund_naira = (Decimal(int(amount_kobo)) / 100).quantize(Decimal("0.01"))
        order.refund_amount = (order.refund_amount or Decimal("0.00")) + refund_naira
        if refund_id:
            order.refund_reference = refund_id
        accumulated = True

    order.refunded_at = order.refunded_at or timezone.now()
    if (order.refund_amount or Decimal("0.00")) >= payment.amount:
        order.payment_status = PaymentStatus.REFUNDED
    order.save(update_fields=["payment_status", "refund_amount", "refund_reference", "refunded_at", "updated_at"])
    if accumulated:
        order.add_history(order.status, f"Paystack processed a refund of ₦{refund_naira} for this order.")
        # One email per refund id; Paystack's redelivery of the same webhook is
        # swallowed by the outbox idempotency key.
        send_order_refunded(
            order,
            amount=refund_naira,
            reference=refund_id or order.refund_reference,
            is_partial=(order.refund_amount or Decimal("0.00")) < payment.amount,
            note=f"Paystack processed a refund of ₦{refund_naira} for this order.",
        )


def verify_payment_with_provider(payment):
    """Re-check one payment against Paystack and apply the outcome.

    Returns ``"success"``, ``"failed"``, ``"abandoned"``, ``"pending"``,
    ``"not_found"`` or ``"error"`` (Paystack unreachable — the payment is left
    exactly as it was). The provider call happens outside any transaction; the
    books update under a row lock so two callers can never double-apply an
    outcome.
    """
    try:
        data = paystack.verify_transaction(payment.reference)
    except paystack.PaystackNotFound:
        # Paystack has no record of this reference — the attempt never became
        # a charge. Close it so it stops looking "open" forever.
        with transaction.atomic():
            payment = Payment.objects.select_for_update().select_related("order").filter(pk=payment.pk).first()
            if payment is None:
                # Deleted while we were asking Paystack (the order was removed
                # in another tab) — nothing left to apply.
                return "not_found"
            if payment.status == Payment.Status.SUCCESS:
                return "success"
            _close_payment(
                payment,
                Payment.Status.FAILED,
                {"gateway_response": "Paystack has no record of this transaction."},
            )
        return "not_found"
    except paystack.PaystackError as exc:
        logger.warning("Could not verify payment %s with Paystack: %s", payment.reference, exc)
        return "error"
    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("order").filter(pk=payment.pk).first()
        if payment is None:
            return "not_found"
        if payment.status == Payment.Status.SUCCESS:
            # Already final (e.g. the webhook landed between selection and this
            # lock) — never let a stale read regress a confirmed payment.
            return "success"
        return process_paystack_result(payment, data)


def open_payments(*, hours=OPEN_ATTEMPT_WINDOW_HOURS, order_number="", limit=MAX_REFRESH_ATTEMPTS):
    """Recent Paystack payments that have not reached a successful outcome yet.

    Newest first. ``hours`` bounds the look-back; ``limit`` caps how many
    provider calls a caller can be tricked into making in one sweep.
    """
    queryset = (
        Payment.objects.select_related("order")
        .filter(provider=Payment.Provider.PAYSTACK, created_at__gte=timezone.now() - timedelta(hours=hours))
        .exclude(status=Payment.Status.SUCCESS)
        .order_by("-created_at")
    )
    if order_number:
        queryset = queryset.filter(order__order_number=order_number)
    if limit:
        queryset = queryset[:limit]
    return list(queryset)


def reconcile_order_payments(order, *, attempts=MAX_REFRESH_ATTEMPTS, window_hours=OPEN_ATTEMPT_WINDOW_HOURS):
    """Re-verify every recent open Paystack attempt on one order.

    Returns ``(changed, results)`` — ``results`` holds ``(payment, outcome)``
    tuples and ``changed`` is True when at least one attempt was newly
    confirmed successful.
    """
    if not settings.PAYSTACK_SECRET_KEY:
        return False, []
    results = []
    changed = False
    for payment in open_payments(hours=window_hours, order_number=order.order_number, limit=attempts):
        outcome = verify_payment_with_provider(payment)
        results.append((payment, outcome))
        if outcome == "success":
            changed = True
    return changed, results
