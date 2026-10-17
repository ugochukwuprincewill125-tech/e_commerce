from django.db.models import Prefetch
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.services import get_cart
from apps.products.models import ProductImage

from .models import Order, OrderItem
from .receipt_codes import code_matches
from .serializers import (
    CreateOrderSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    PublicTrackingSerializer,
    ReceiptSerializer,
    TrackOrderSerializer,
)
from .services import cancel_order, create_order_from_cart, delete_order


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
class ReceiptVerifyView(APIView):
    """
    GET /api/orders/verify-receipt/?order_number=&code=  — public, no sign-in.
    Anyone handed a "receipt" (support, the store, a third party) can confirm
    it actually came from us: the code printed on the receipt is an HMAC over
    the order's own facts, so forged receipts do not verify. Deliberately
    returns minimal data — no customer PII through this endpoint.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def get(self, request):
        number = (request.query_params.get("order_number") or "").strip().upper()
        code = request.query_params.get("code") or ""
        if not number or not code.strip():
            return Response(
                {"valid": False, "detail": "Enter both the order number and the verification code from the receipt."}
            )
        order = Order.objects.filter(order_number__iexact=number).first()
        if order and order.is_paid and code_matches(order, code):
            return Response(
                {
                    "valid": True,
                    "order_number": order.order_number,
                    "status": order.get_status_display(),
                    "total": str(order.total),
                    "paid_at": order.paid_at,
                }
            )
        return Response(
            {"valid": False, "detail": "This receipt does not verify — it did not come from us. Contact the store before treating it as proof of payment."}
        )


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
