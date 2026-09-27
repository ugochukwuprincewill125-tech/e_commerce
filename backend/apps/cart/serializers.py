from rest_framework import serializers

from apps.products.models import Product, ProductVariant
from apps.products.serializers import ProductListSerializer

from .models import Cart, CartItem
from .pricing import cart_subtotal


class CartVariantSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = ("id", "variant_type", "value", "label", "color_hex")


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    selected_variant = CartVariantSerializer(read_only=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    available_stock = serializers.IntegerField(read_only=True)
    issue = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ("id", "product", "selected_variant", "quantity", "unit_price", "line_total", "available_stock", "issue", "added_at")

    def get_issue(self, obj):
        if not obj.product.is_active:
            return "This product is no longer available."
        if obj.available_stock <= 0:
            return "Out of stock."
        if obj.quantity > obj.available_stock:
            return f"Only {obj.available_stock} left in stock."
        return None


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    has_issues = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ("session_id", "items", "item_count", "subtotal", "has_issues", "updated_at")

    def get_item_count(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_subtotal(self, obj):
        return str(cart_subtotal(obj))

    def get_has_issues(self, obj):
        return any(
            (not i.product.is_active) or i.available_stock <= 0 or i.quantity > i.available_stock
            for i in obj.items.all()
        )


class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, max_value=99, default=1)

    def validate(self, attrs):
        product = Product.objects.active().filter(pk=attrs["product_id"]).first()
        if not product:
            raise serializers.ValidationError({"product_id": "This product is not available."})
        variant = None
        variant_id = attrs.get("variant_id")
        has_variants = product.variants.filter(is_active=True).exists()
        if variant_id:
            variant = product.variants.filter(pk=variant_id, is_active=True).first()
            if not variant:
                raise serializers.ValidationError({"variant_id": "Please choose a valid option."})
        elif has_variants:
            variant = product.variants.filter(is_active=True, stock_quantity__gt=0).first()
        attrs["product"] = product
        attrs["variant"] = variant
        return attrs


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=99)
