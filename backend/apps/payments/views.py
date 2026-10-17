import json
import logging
import secrets
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order, PaymentStatus
from apps.orders.services import mark_order_paid

from . import paystack
from .models import Payment

logger = logging.getLogger(__name__)


def new_reference(order):
    return f"{order.order_number}-{secrets.token_hex(4).upper()}"


def test_mode_enabled():
    return settings.DEBUG and settings.PAYMENT_TEST_MODE


class PaymentConfigView(APIView):
    """GET /api/payments/config/ — only public information."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "provider": "paystack",
                "public_key": settings.PAYSTACK_PUBLIC_KEY,
                "configured": bool(settings.PAYSTACK_SECRET_KEY),
                # The simulated "test mode" only ever runs when NO keys are
                # set — a configured store always goes through Paystack, even
                # locally. Keep the flag truthful so the checkout banner can't
                # promise "no real money" while real keys are in use.
                "test_mode": test_mode_enabled() and not settings.PAYSTACK_SECRET_KEY,
                "currency": "NGN",
            }
        )


class InitializeSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=30)


class InitializePaymentView(APIView):
    """
    POST /api/payments/initialize/ {order_number}
    Starts a Paystack transaction for the order total calculated by the server
    and returns the hosted checkout URL to redirect the customer to.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "payments"

    @transaction.atomic
    def post(self, request):
        serializer = InitializeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Row-lock the order so two tabs (or a double click) can never race "does
        # an initialized payment exist?" and create two references for one order.
        # The second caller waits, then is handed the same authorization_url.
        order = Order.objects.select_for_update().filter(
            user=request.user, order_number=serializer.validated_data["order_number"]
        ).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if order.is_paid:
            return Response({"detail": "This order has already been paid."}, status=status.HTTP_400_BAD_REQUEST)
        if not order.can_pay:
            return Response({"detail": "This order can no longer be paid for."}, status=status.HTTP_400_BAD_REQUEST)

        if order.total <= 0:
            # Fully discounted (e.g. a 100%-off coupon): there is nothing to
            # charge, so confirm the order immediately and walk the customer
            # through the normal callback — a ₦0 Paystack charge would be
            # rejected and would dead-end the checkout forever.
            reference = new_reference(order)
            Payment.objects.create(
                order=order,
                provider=Payment.Provider.FREE,
                reference=reference,
                amount=order.total,
                status=Payment.Status.SUCCESS,
                verified_at=timezone.now(),
                gateway_response="Free order — no charge (fully discounted).",
            )
            mark_order_paid(order, reference, note="Order fully covered by a discount — no payment required.")
            url = f"{settings.FRONTEND_URL}/payment/callback?reference={reference}"
            return Response(
                {"authorization_url": url, "access_code": "", "reference": reference, "test_mode": False, "free_order": True}
            )

        existing = Payment.objects.filter(
            order=order, status=Payment.Status.INITIALIZED, provider=Payment.Provider.PAYSTACK
        ).first()
        if existing and existing.authorization_url:
            # Already-opened checkout for this order: reuse it instead of starting
            # a second transaction the customer could pay twice.
            return Response(
                {"authorization_url": existing.authorization_url, "access_code": "", "reference": existing.reference, "test_mode": False}
            )
        if existing:
            # A previous attempt stored no checkout URL (provider glitch) —
            # retire it so a fresh reference can be created below.
            existing.status = Payment.Status.FAILED
            existing.gateway_response = "Re-initialized: no authorization URL was stored for this attempt."
            existing.save(update_fields=["status", "gateway_response"])

        reference = new_reference(order)
        callback_url = f"{settings.FRONTEND_URL}/payment/callback"

        if settings.PAYSTACK_SECRET_KEY:
            try:
                data = paystack.initialize_transaction(
                    email=order.email,
                    amount_naira=order.total,
                    reference=reference,
                    callback_url=callback_url,
                    metadata={"order_number": order.order_number, "customer": order.customer_name},
                )
            except paystack.PaystackError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
            Payment.objects.create(
                order=order, provider=Payment.Provider.PAYSTACK, reference=reference, amount=order.total,
                authorization_url=data.get("authorization_url", ""), raw_response=data,
            )
            order.payment_reference = reference
            order.save(update_fields=["payment_reference", "updated_at"])
            return Response(
                {"authorization_url": data["authorization_url"], "access_code": data.get("access_code"), "reference": reference, "test_mode": False}
            )

        if test_mode_enabled():
            url = f"{callback_url}?reference={reference}&test=1"
            Payment.objects.create(order=order, provider=Payment.Provider.TEST, reference=reference, amount=order.total, authorization_url=url)
            order.payment_reference = reference
            order.save(update_fields=["payment_reference", "updated_at"])
            return Response({"authorization_url": url, "reference": reference, "test_mode": True})

        return Response(
            {"detail": "Online payment is not configured yet. Please contact the store to complete your order."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


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


class VerifyPaymentView(APIView):
    """GET /api/payments/verify/<reference>/ — confirm a payment after the redirect."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "payments"

    @transaction.atomic
    def get(self, request, reference):
        payment = Payment.objects.select_for_update().select_related("order").filter(
            reference=reference, order__user=request.user
        ).first()
        if not payment:
            return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        outcome = "success"
        if payment.status != Payment.Status.SUCCESS:
            if payment.provider == Payment.Provider.TEST:
                if not test_mode_enabled():
                    return Response({"detail": "Test payments are disabled."}, status=status.HTTP_400_BAD_REQUEST)
                _finalise_success(payment, {"gateway_response": "Test mode approval", "reference": reference}, "test")
                outcome = "success"
            elif payment.provider == Payment.Provider.FREE:
                # Free orders are created already successful; nothing to verify.
                outcome = "success"
            else:
                try:
                    data = paystack.verify_transaction(reference)
                except paystack.PaystackError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
                outcome = process_paystack_result(payment, data)

        payment.refresh_from_db()
        order = payment.order
        order.refresh_from_db()
        success = payment.status == Payment.Status.SUCCESS
        pending = not success and outcome == "pending"
        if success:
            detail = "Payment confirmed. Thank you for shopping with Timeline Gadgets!"
        elif pending:
            detail = (
                "Your payment is still being processed by the provider — this can happen with bank "
                "transfers. Check again in a few minutes; your order updates automatically once it lands."
            )
        elif outcome == "abandoned":
            detail = "This payment attempt was not completed. You can try paying again from the order page."
        else:
            detail = "We couldn't confirm this payment. If you were debited, please contact us with your order number."
        return Response(
            {
                "success": success,
                "pending": pending,
                "status": payment.status,
                "order_number": order.order_number,
                "payment_status": order.payment_status,
                "amount": str(payment.amount),
                "test_mode": payment.provider == Payment.Provider.TEST,
                "detail": detail,
            },
            status=status.HTTP_200_OK,
        )


def record_gateway_refund(payment, data):
    """Reconcile a ``refund.processed`` webhook with our own records.

    Refunds are arranged by the support team (usually from the Paystack
    dashboard); this keeps the order's books in step with the money. Paystack
    redelivers webhooks, and a refund that is already recorded (its refund
    ``id`` is on the order) is recognised so it is never counted twice. The
    order only flips to ``refunded`` once the whole paid amount has come back.
    """
    order = payment.order
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


class PaystackWebhookView(APIView):
    """
    POST /api/payments/webhook/ — configure this URL in the Paystack dashboard.
    Requests are authenticated with the x-paystack-signature HMAC header.

    Every event is acknowledged with 200 once the signature checks out (even
    if unknown) so Paystack doesn't retry-spam; anything we can't match is
    logged loudly for manual reconciliation in the Paystack dashboard.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        raw = request.body
        if not paystack.valid_webhook_signature(raw, request.META.get("HTTP_X_PAYSTACK_SIGNATURE", "")):
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        try:
            event = json.loads(raw)
        except ValueError:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        event_type = event.get("event", "")
        data = event.get("data", {}) or {}
        # Refund events nest the transaction object; charge events carry a
        # top-level reference. Resolve whichever shape arrived.
        tx = data.get("transaction")
        reference = data.get("reference") or (tx.get("reference") if isinstance(tx, dict) else "")
        logger.info("Paystack webhook received: %s ref=%s", event_type, reference)

        def locked_payment():
            if not reference:
                return None
            return Payment.objects.select_for_update().select_related("order").filter(reference=reference).first()

        def unknown_reference_note():
            logger.warning(
                "Webhook %s for unknown reference %s (amount=%s email=%s) — "
                "check the Paystack dashboard and reconcile manually.",
                event_type, reference, data.get("amount"),
                (data.get("customer") or {}).get("email") if isinstance(data.get("customer"), dict) else None,
            )

        if event_type == "charge.success":
            with transaction.atomic():
                payment = locked_payment()
                if payment and payment.status != Payment.Status.SUCCESS:
                    outcome = process_paystack_result(payment, data)
                    logger.info("charge.success processed for %s: %s", reference, outcome)
                elif payment:
                    logger.info("charge.success for already-successful payment %s ignored.", reference)
                else:
                    unknown_reference_note()

        elif event_type == "charge.failed":
            with transaction.atomic():
                payment = locked_payment()
                if payment and payment.status == Payment.Status.INITIALIZED:
                    _close_payment(payment, Payment.Status.FAILED, data, fail_order=True)

        elif event_type == "refund.processed":
            with transaction.atomic():
                payment = locked_payment()
                if payment:
                    record_gateway_refund(payment, data)
                else:
                    unknown_reference_note()

        elif event_type == "refund.pending":
            logger.info("Paystack refund pending for %s", reference)

        elif event_type == "refund.failed":
            with transaction.atomic():
                payment = locked_payment()
                if payment:
                    logger.warning("Paystack reported a FAILED refund for %s — check the dashboard.", reference)
                    payment.order.add_history(
                        payment.order.status,
                        "Paystack reported a failed refund — check the Paystack dashboard.",
                    )

        elif event_type.startswith("charge.dispute."):
            with transaction.atomic():
                payment = locked_payment()
                if payment:
                    logger.warning("Dispute event %s for %s", event_type, reference)
                    if event_type == "charge.dispute.create":
                        payment.order.add_history(
                            payment.order.status,
                            "The customer's bank opened a charge dispute — respond in the Paystack dashboard.",
                        )
                else:
                    unknown_reference_note()

        else:
            logger.info("Un-handled Paystack event: %s", event_type)

        return Response(status=status.HTTP_200_OK)



