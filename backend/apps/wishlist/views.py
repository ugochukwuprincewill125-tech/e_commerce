from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.models import CartItem
from apps.cart.services import get_cart
from apps.products.models import Product
from apps.products.serializers import ProductListSerializer

from .models import Wishlist


class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)

    class Meta:
        model = Wishlist
        fields = ("id", "product", "created_at")


def wishlist_payload(request):
    items = (
        Wishlist.objects.filter(user=request.user)
        .select_related("product__brand", "product__category")
        .prefetch_related("product__images", "product__variants")
    )
    return {
        "count": items.count(),
        "product_ids": [i.product_id for i in items],
        "items": WishlistItemSerializer(items, many=True, context={"request": request}).data,
    }


class WishlistView(APIView):
    """
    GET  /api/wishlist/                 saved products
    POST /api/wishlist/ {product_id}    save a product
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(wishlist_payload(request))

    def post(self, request):
        product = Product.objects.active().filter(pk=request.data.get("product_id")).first()
        if not product:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        _, created = Wishlist.objects.get_or_create(user=request.user, product=product)
        payload = wishlist_payload(request)
        payload["detail"] = f"{product.name} saved to your wishlist." if created else "Already in your wishlist."
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class WishlistItemView(APIView):
    """DELETE /api/wishlist/<product_id>/"""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, product_id):
        deleted, _ = Wishlist.objects.filter(user=request.user, product_id=product_id).delete()
        if not deleted:
            return Response({"detail": "This product isn't in your wishlist."}, status=status.HTTP_404_NOT_FOUND)
        payload = wishlist_payload(request)
        payload["detail"] = "Removed from your wishlist."
        return Response(payload)


class MoveToCartView(APIView):
    """POST /api/wishlist/<product_id>/move-to-cart/"""

    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, product_id):
        entry = Wishlist.objects.select_related("product").filter(user=request.user, product_id=product_id).first()
        if not entry:
            return Response({"detail": "This product isn't in your wishlist."}, status=status.HTTP_404_NOT_FOUND)
        product = entry.product
        variant = product.variants.filter(is_active=True, stock_quantity__gt=0).first()
        stock = min(variant.stock_quantity, product.stock_quantity) if variant else product.stock_quantity
        if not product.is_active or stock <= 0:
            return Response({"detail": f"{product.name} is currently out of stock."}, status=status.HTTP_400_BAD_REQUEST)

        cart = get_cart(request)
        item, created = CartItem.objects.get_or_create(cart=cart, product=product, selected_variant=variant)
        if not created:
            item.quantity = min(item.quantity + 1, stock)
            item.save(update_fields=["quantity"])
        entry.delete()
        payload = wishlist_payload(request)
        payload["detail"] = f"{product.name} moved to your cart."
        return Response(payload)
