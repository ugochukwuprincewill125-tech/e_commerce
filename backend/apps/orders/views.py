import hmac

from django.conf import settings
from django.db.models import Prefetch
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.services import get_cart
from apps.products.models import ProductImage

from .models import Order, OrderItem, OrderStatus, PaymentStatus
from .serializers import (
    CreateOrderSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    PublicTrackingSerializer,
    ReceiptSerializer,
    TrackOrderSerializer,
)
from .services import cancel_order, create_order_from_cart, delete_order, release_stale_unpaid_orders


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
         DELETE /api/orders/<order_number>/         delete one of the customer's own orders — only cancelled or delivered ones
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
            if order.status == OrderStatus.CANCELLED and order.payment_status == PaymentStatus.PAID:
                return Response(
                    {"detail": "This order received a payment after it was cancelled. Contact support so "
                               "the payment can be refunded before the order is deleted."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": "Only cancelled or delivered orders can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        delete_order(order)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def receipt(self, request, order_number=None):
        order = self.get_object()
        if not order.is_paid:
            return Response({"detail": "Receipts are only available for paid orders."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReceiptSerializer(order, context={"request": request}).data)


class TrackOrderView(APIView):
    """POST /api/orders/track/ {order_number, email} — public order tracking."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = TrackOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = order_queryset().filter(
            order_number__iexact=serializer.validated_data["order_number"].strip(),
            email__iexact=serializer.validated_data["email"].strip(),
        ).first()
        if not order:
            return Response(
                {"detail": "We couldn't find an order with those details. Check the order number and email."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(PublicTrackingSerializer(order, context={"request": request}).data)


class ReleaseUnpaidOrdersView(APIView):
    """POST /api/orders/maintenance/release-unpaid/ — token-guarded upkeep.

    Render's free tier has no cron, so `.github/workflows/maintenance.yml`
    calls this on a schedule (with the X-Maintenance-Token header) to cancel
    unpaid orders past their expiry and put the reserved stock back on the
    shelf. Disabled (404) until MAINTENANCE_TOKEN is configured.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        token = settings.MAINTENANCE_TOKEN
        supplied = request.META.get("HTTP_X_MAINTENANCE_TOKEN", "")
        if not token or not hmac.compare_digest(token, supplied):
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            hours = int(request.data.get("hours", 0)) or None
        except (TypeError, ValueError):
            hours = None
        count = release_stale_unpaid_orders(hours)
        return Response({"cancelled": count})
