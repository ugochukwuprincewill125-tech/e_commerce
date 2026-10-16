import json
import logging
import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order, OrderStatus, PaymentStatus
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
                "test_mode": test_mode_enabled(),
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

    def post(self, request):
        serializer = InitializeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = Order.objects.filter(user=request.user, order_number=serializer.validated_data["order_number"]).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if order.is_paid:
            return Response({"detail": "This order has already been paid."}, status=status.HTTP_400_BAD_REQUEST)
        if not order.can_pay:
            return Response({"detail": "This order can no longer be paid for."}, status=status.HTTP_400_BAD_REQUEST)

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
    mark_order_paid(order, payment.reference)


def process_paystack_result(payment, data):
    """Validate a Paystack transaction payload against our own records."""
    ok = (
        data.get("status") == "success"
        and int(data.get("amount", 0)) == paystack.to_kobo(payment.amount)
        and str(data.get("currency", "NGN")).upper() == payment.currency
        and data.get("reference") == payment.reference
    )
    if ok:
        _finalise_success(payment, data, data.get("channel", ""))
        return True
    payment.status = Payment.Status.ABANDONED if data.get("status") == "abandoned" else Payment.Status.FAILED
    payment.gateway_response = str(data.get("gateway_response", data.get("status", "")))[:255]
    payment.raw_response = data
    payment.save()
    if payment.order.payment_status == PaymentStatus.PENDING and data.get("status") == "failed":
        payment.order.payment_status = PaymentStatus.FAILED
        payment.order.save(update_fields=["payment_status", "updated_at"])
    return False


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

        if payment.status != Payment.Status.SUCCESS:
            if payment.provider == Payment.Provider.TEST:
                if not test_mode_enabled():
                    return Response({"detail": "Test payments are disabled."}, status=status.HTTP_400_BAD_REQUEST)
                _finalise_success(payment, {"gateway_response": "Test mode approval", "reference": reference}, "test")
            else:
                try:
                    data = paystack.verify_transaction(reference)
                except paystack.PaystackError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
                process_paystack_result(payment, data)

        payment.refresh_from_db()
        order = payment.order
        order.refresh_from_db()
        success = payment.status == Payment.Status.SUCCESS
        return Response(
            {
                "success": success,
                "status": payment.status,
                "order_number": order.order_number,
                "payment_status": order.payment_status,
                "amount": str(payment.amount),
                "test_mode": payment.provider == Payment.Provider.TEST,
            "detail": "Payment confirmed. Thank you for shopping with Timeline Gadgets!" if success
                else "We couldn't confirm this payment. If you were debited, please contact us with your order number.",
            },
            status=status.HTTP_200_OK,
        )


class RefundSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class RefundPaymentView(APIView):
    """
    POST /api/payments/refund/<order_number>/
    Staff-only: initiate a (partial or full) refund through Paystack and
    synchronise the order/payment records.
    """

    permission_classes = [permissions.IsAdminUser]

    @transaction.atomic
    def post(self, request, order_number):
        serializer = RefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = Order.objects.select_for_update().filter(order_number=order_number).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if order.payment_status != PaymentStatus.PAID:
            return Response({"detail": "Only paid orders can be refunded."}, status=status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.select_for_update().filter(
            order=order, status=Payment.Status.SUCCESS, provider=Payment.Provider.PAYSTACK
        ).first()
        if not payment:
            return Response({"detail": "No Paystack payment record found for this order."}, status=status.HTTP_404_NOT_FOUND)

        amount = serializer.validated_data.get("amount")
        refund_naira = amount if amount is not None else payment.amount

        if refund_naira > payment.amount:
            return Response({"detail": f"Refund amount ({refund_naira}) cannot exceed the paid amount ({payment.amount})."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            paystack.refund_transaction(payment.reference, refund_naira)
        except paystack.PaystackError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        payment.status = Payment.Status.FAILED if refund_naira == payment.amount else payment.status
        payment.refund_note = serializer.validated_data.get("note", "")[:500]
        payment.save(update_fields=["status", "refund_note", "verified_at"])
        payment.refresh_from_db()

        order.payment_status = PaymentStatus.REFUNDED
        order.refund_amount = refund_naira
        order.refund_reference = payment.reference
        order.refunded_at = timezone.now()
        order.save(update_fields=["payment_status", "refund_amount", "refund_reference", "refunded_at", "updated_at"])
        order.add_history(order.status, f"Refunded ₦{refund_naira} via Paystack. {serializer.validated_data.get('note', '')}".strip())
        return Response({"detail": "Refund initiated successfully.", "order_number": order.order_number, "refunded": str(refund_naira)},
                        status=status.HTTP_200_OK)


class PaystackWebhookView(APIView):
    """
    POST /api/payments/webhook/ — configure this URL in the Paystack dashboard.
    Requests are authenticated with the x-paystack-signature HMAC header.
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
        data = event.get("data", {})
        reference = data.get("reference")
        logger.info("Paystack webhook received: %s ref=%s", event_type, reference)

        if event_type == "charge.success":
            with transaction.atomic():
                payment = Payment.objects.select_for_update().select_related("order").filter(reference=reference).first()
                if payment and payment.status != Payment.Status.SUCCESS:
                    process_paystack_result(payment, data)
                elif not payment:
                    logger.warning("Webhook for unknown reference %s", reference)

        elif event_type == "charge.failed":
            with transaction.atomic():
                payment = Payment.objects.select_for_update().select_related("order").filter(reference=reference).first()
                if payment and payment.status == Payment.Status.INITIALIZED:
                    payment.status = Payment.Status.FAILED
                    payment.gateway_response = str(data.get("gateway_response", "failed"))[:255]
                    payment.raw_response = data
                    payment.save(update_fields=["status", "gateway_response", "raw_response"])
                    if payment.order.payment_status == PaymentStatus.PENDING:
                        payment.order.payment_status = PaymentStatus.FAILED
                        payment.order.save(update_fields=["payment_status", "updated_at"])

        elif event_type == "refund.processed":
            with transaction.atomic():
                payment = Payment.objects.select_for_update().select_related("order").filter(reference=reference).first()
                if payment and payment.order.payment_status != PaymentStatus.REFUNDED:
                    payment.order.payment_status = PaymentStatus.REFUNDED
                    payment.order.refunded_at = timezone.now()
                    payment.order.save(update_fields=["payment_status", "refunded_at", "updated_at"])

        else:
            logger.info("Un-handled Paystack event: %s", event_type)

        return Response(status=status.HTTP_200_OK)



