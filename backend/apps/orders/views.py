from django.db.models import Prefetch
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.services import get_cart
from apps.products.models import ProductImage

from .models import Order, OrderItem
from .serializers import (
    CreateOrderSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    PublicTrackingSerializer,
    TrackOrderSerializer,
)
from .services import cancel_order, create_order_from_cart


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


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    GET  /api/orders/                         the customer's orders
      ?status=delivered                       filter by status
    POST /api/orders/                         create an order from the server-side cart
    GET  /api/orders/<order_number>/          order details + tracking timeline
    POST /api/orders/<order_number>/cancel/   cancel an unpaid order (stock is released)
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
