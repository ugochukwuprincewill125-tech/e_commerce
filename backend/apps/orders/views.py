import hmac

from django.conf import settings
from django.db.models import Prefetch
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.services import get_cart
from apps.payments.services import reconcile_order_payments
from apps.products.models import ProductImage

from .models import Order, OrderItem
from .serializers import (
    CreateOrderSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    ReceiptSerializer,
)
from .services import (
    cancel_order,
    create_order_from_cart,
    delete_order,
    payment_state_before_delete,
    process_unpaid_order_followups,
    release_stale_unpaid_orders,
)


def order_queryset():
    return Order.objects.prefetch_related(
        Prefetch(
            "items",
            queryset=OrderItem.objects.select_related("product").prefetch_related(
                Prefetch("product__images", queryset=ProductImage.objects.order_by("display_order", "id"))
            ),
        ),
        "history",
    )


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    GET  /api/orders/                         the customer's orders
       ?status=delivered                       filter by status
         GET  /api/orders/<order_number>/          order details + tracking timeline
         POST /api/orders/<order_number>/cancel/   cancel an unpaid order (stock is released)
         POST /api/orders/<order_number>/refresh-payment/  re-check open Paystack attempts on demand
         DELETE /api/orders/<order_number>/         delete one of the customer's own orders — only placed-but-unpaid ones
         GET  /api/orders/<order_number>/receipt/    receipt data for a paid order
    """

    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "order_number"
    filterset_fields = ["status", "payment_status"]

    def get_queryset(self):
        return order_queryset().filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return OrderListSerializer
        if self.action == "create":
            return CreateOrderSerializer
        return OrderDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = get_cart(request)
        order = create_order_from_cart(request.user, cart, serializer.validated_data)
        order = order_queryset().get(pk=order.pk)
        return Response(OrderDetailSerializer(order, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, order_number=None):
        order = self.get_object()
        if not order.can_cancel:
            return Response(
                {"detail": "This order can no longer be cancelled. Please contact support."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cancel_order(order)
        order = order_queryset().get(pk=order.pk)
        return Response(OrderDetailSerializer(order, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        order = self.get_object()
        if not order.can_delete:
            return Response(
                {"detail": "Only orders that have been placed but not yet paid can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # A customer can start a Paystack payment and close the tab before the
        # webhook lands. Re-check open attempts before destroying the record so
        # a paid order is never erased by a "delete" click.
        state = payment_state_before_delete(order)
        if state == "paid":
            return Response(
                {"detail": "A payment has been confirmed for this order, so it can no longer be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if state == "pending":
            return Response(
                {"detail": "A payment for this order is still being confirmed. Please try again shortly."},
                status=status.HTTP_409_CONFLICT,
            )
        if state == "error":
            return Response(
                {"detail": "We could not verify this order's payment with Paystack right now. Please try again shortly."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        delete_order(order)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def receipt(self, request, order_number=None):
        order = self.get_object()
        if not order.is_paid:
            return Response({"detail": "Receipts are only available for paid orders."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReceiptSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="refresh-payment")
    def refresh_payment(self, request, order_number=None):
        """Re-check this order's open Paystack attempts against Paystack.

        The webhook reconciles automatically in production, but a customer
        can return before it lands (or the webhook can be delayed or missed —
        it cannot reach a local dev backend at all). This lets the order page
        heal the books on demand, so a charge that settled after the customer
        cancelled the checkout is confirmed here instead of staying invisible.
        """
        order = self.get_object()
        changed, results = reconcile_order_payments(order)
        order = order_queryset().get(pk=order.pk)
        data = OrderDetailSerializer(order, context={"request": request}).data
        if changed:
            data["payment_check"] = "updated"
        elif results and all(outcome == "error" for _, outcome in results):
            data["payment_check"] = "unavailable"
        else:
            data["payment_check"] = "no_change"
        return Response(data)


class MaintenanceTokenMixin:
    """Shared X-Maintenance-Token check for token-guarded upkeep endpoints."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def authorized(self, request):
        token = settings.MAINTENANCE_TOKEN
        supplied = request.META.get("HTTP_X_MAINTENANCE_TOKEN", "")
        return bool(token) and hmac.compare_digest(token, supplied)


class ReleaseUnpaidOrdersView(MaintenanceTokenMixin, APIView):
    """POST /api/orders/maintenance/release-unpaid/ — token-guarded upkeep.

    Render's free tier has no cron, so the scheduled GitHub workflow calls
    this endpoint (with the X-Maintenance-Token header) to cancel legacy
    unpaid orders past their expiry and put the reserved stock back on the
    shelf. Disabled (404) until MAINTENANCE_TOKEN is configured.
    """

    def post(self, request):
        if not self.authorized(request):
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            hours = int(request.data.get("hours", 0)) or None
        except (TypeError, ValueError):
            hours = None
        count = release_stale_unpaid_orders(hours)
        return Response({"cancelled": count})


class ProcessUnpaidOrdersView(MaintenanceTokenMixin, APIView):
    """POST /api/orders/maintenance/process-unpaid/ — reminder + cleanup.

    Runs the abandoned-checkout sweep: one reminder email after the configured
    delay, then permanent deletion (customer AND admin) once the grace period
    has passed without payment. Any Paystack attempt still pending or
    unverifiable defers deletion to the next run rather than risking a paid
    order. `.github/workflows/unpaid-orders.yml` calls this every 10 minutes.
    """

    def post(self, request):
        if not self.authorized(request):
            return Response(status=status.HTTP_404_NOT_FOUND)
        result = process_unpaid_order_followups()
        return Response(result)
