from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CartItem
from .pricing import build_quote
from .serializers import AddToCartSerializer, CartSerializer, UpdateCartItemSerializer
from .services import cart_queryset, get_cart, merge_guest_cart


def cart_response(request, cart, status_code=status.HTTP_200_OK, message=None):
    cart = cart_queryset().get(pk=cart.pk)  # fresh copy with prefetches
    data = CartSerializer(cart, context={"request": request}).data
    if message:
        data["detail"] = message
    return Response(data, status=status_code)


class CartView(APIView):
    """
    GET    /api/cart/   current cart (creates a guest cart if needed)
    DELETE /api/cart/   empty the cart
    Guests must send the returned `session_id` back in the X-Cart-Session header.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return cart_response(request, get_cart(request))

    def delete(self, request):
        cart = get_cart(request)
        cart.items.all().delete()
        return cart_response(request, cart, message="Your cart has been cleared.")


class CartItemsView(APIView):
    """POST /api/cart/items/  {product_id, variant_id?, quantity}"""

    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = AddToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data["product"]
        variant = serializer.validated_data["variant"]
        quantity = serializer.validated_data["quantity"]

        cart = get_cart(request)
        item = CartItem.objects.select_for_update().filter(cart=cart, product=product, selected_variant=variant).first()
        new_quantity = quantity + (item.quantity if item else 0)

        stock = min(variant.stock_quantity, product.stock_quantity) if variant else product.stock_quantity
        if stock <= 0:
            return Response({"detail": f"{product.name} is currently out of stock."}, status=status.HTTP_400_BAD_REQUEST)
        if new_quantity > stock:
            return Response(
                {"detail": f"Only {stock} unit(s) of {product.name} available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if item:
            item.quantity = new_quantity
            item.save(update_fields=["quantity"])
        else:
            CartItem.objects.create(cart=cart, product=product, selected_variant=variant, quantity=quantity)
        cart.save(update_fields=["updated_at"])
        name = f"{product.name} ({variant.value})" if variant else product.name
        return cart_response(request, cart, status.HTTP_201_CREATED, f"{name} added to your cart.")


class CartItemDetailView(APIView):
    """PATCH/DELETE /api/cart/items/<id>/"""

    permission_classes = [permissions.AllowAny]

    def _item(self, request, pk):
        cart = get_cart(request, create=False)
        if not cart:
            return None, None
        return cart, CartItem.objects.select_related("product", "selected_variant").filter(cart=cart, pk=pk).first()

    def patch(self, request, pk):
        cart, item = self._item(request, pk)
        if not item:
            return Response({"detail": "Cart item not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity"]
        if quantity > item.available_stock:
            return Response(
                {"detail": f"Only {item.available_stock} unit(s) available."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.quantity = quantity
        item.save(update_fields=["quantity"])
        return cart_response(request, cart)

    def delete(self, request, pk):
        cart, item = self._item(request, pk)
        if not item:
            return Response({"detail": "Cart item not found."}, status=status.HTTP_404_NOT_FOUND)
        name = item.product.name
        item.delete()
        return cart_response(request, cart, message=f"{name} removed from your cart.")


class MergeCartSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()


class MergeCartView(APIView):
    """POST /api/cart/merge/ {session_id} — called right after sign-in."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = MergeCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        merge_guest_cart(request.user, serializer.validated_data["session_id"])
        return cart_response(request, get_cart(request))


class QuoteSerializer(serializers.Serializer):
    coupon_code = serializers.CharField(required=False, allow_blank=True, max_length=40)
    state = serializers.CharField(required=False, allow_blank=True, max_length=80)
    delivery_method = serializers.ChoiceField(choices=["delivery", "pickup"], required=False, default="delivery")


class CartQuoteView(APIView):
    """POST /api/cart/quote/ {coupon_code?, state?, delivery_method?} — server-calculated totals."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = QuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = get_cart(request)
        return Response(build_quote(cart, **serializer.validated_data))
