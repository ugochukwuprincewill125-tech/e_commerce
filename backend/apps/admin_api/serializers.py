"""Serializers for the admin API (staff-only endpoints)."""
from decimal import Decimal

from rest_framework import serializers

from apps.brands.models import Brand
from apps.brands.serializers import BrandMiniSerializer
from apps.categories.models import Category
from apps.categories.serializers import CategoryMiniSerializer
from apps.core.models import ContactMessage
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.serializers import OrderItemSerializer
from apps.orders.services import tracking_steps
from apps.products.models import Product, ProductImage, ProductVariant
from apps.promotions.models import Coupon
from apps.reviews.models import Review
from apps.users.models import User
from apps.users.serializers import AddressSerializer


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "display_order")


class AdminProductVariantSerializer(serializers.ModelSerializer):
    """Read/write variant representation; `id` present for updates."""

    id = serializers.IntegerField(required=False)
    label = serializers.CharField(read_only=True)
    price = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = (
            "id", "variant_type", "value", "sku", "price_adjustment", "price",
            "stock_quantity", "in_stock", "color_hex", "is_active", "display_order", "label",
        )

    def get_price(self, obj):
        return str(obj.unit_price())

    def get_in_stock(self, obj):
        return obj.stock_quantity > 0


class AdminProductListSerializer(serializers.ModelSerializer):
    brand = BrandMiniSerializer(read_only=True)
    category = CategoryMiniSerializer(read_only=True)
    current_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discount_percent = serializers.IntegerField(read_only=True)
    availability_display = serializers.CharField(source="get_availability_display", read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    product_type_display = serializers.CharField(source="get_product_type_display", read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id", "name", "slug", "sku", "short_description", "brand", "category",
            "product_type", "product_type_display", "price", "discount_price", "current_price",
            "discount_percent", "stock_quantity", "availability", "availability_display",
            "is_low_stock", "featured", "bestseller", "new_arrival", "is_active",
            "rating", "review_count", "image", "created_at", "updated_at",
        )

    def get_image(self, obj):
        images = list(obj.images.all())
        if not images:
            return None
        request = self.context.get("request")
        url = images[0].image.url
        return request.build_absolute_uri(url) if request else url


class AdminProductDetailSerializer(AdminProductListSerializer):
    images = AdminProductImageSerializer(many=True, read_only=True)
    variants = AdminProductVariantSerializer(many=True, read_only=True)

    class Meta(AdminProductListSerializer.Meta):
        fields = AdminProductListSerializer.Meta.fields + (
            "description", "specifications", "warranty", "images", "variants",
            "meta_title", "meta_description",
        )


class AdminProductWriteSerializer(serializers.ModelSerializer):
    """Create/update a product. File uploads are handled by the view so old
    images can be replaced and display_order assigned in one place."""

    specifications = serializers.JSONField(required=False, default=dict)

    # Declared explicitly: with multipart/form-data DRF would otherwise inject
    # `default_empty_html=False` for these booleans when the key is absent,
    # silently creating products with is_active=False.
    is_active = serializers.BooleanField(required=False, default=True)
    featured = serializers.BooleanField(required=False, default=False)
    bestseller = serializers.BooleanField(required=False, default=False)
    new_arrival = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = Product
        fields = (
            "name", "slug", "sku", "short_description", "description", "category", "brand",
            "product_type", "price", "discount_price", "stock_quantity", "featured", "bestseller",
            "new_arrival", "is_active", "specifications", "warranty",
            "meta_title", "meta_description",
        )
        extra_kwargs = {"slug": {"required": False}, "sku": {"required": True}}

    def validate_discount_price(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Discount price must be greater than zero.")
        return value

    def validate(self, attrs):
        price = attrs.get("price", getattr(self.instance, "price", None))
        discount = attrs.get("discount_price", getattr(self.instance, "discount_price", None))
        if price is not None and discount is not None and discount >= price:
            raise serializers.ValidationError(
                {"discount_price": "Discount price must be lower than the regular price."}
            )
        return attrs


# ---------------------------------------------------------------------------
# Categories & brands
# ---------------------------------------------------------------------------
class AdminCategorySerializer(serializers.ModelSerializer):
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent_category", queryset=Category.objects.all(), allow_null=True, required=False
    )
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = (
            "id", "name", "slug", "description", "image", "icon", "parent_id",
            "is_active", "is_featured", "display_order", "product_count", "created_at",
        )
        read_only_fields = ("id", "slug", "created_at")


class AdminBrandSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Brand
        fields = (
            "id", "name", "slug", "logo", "description", "website",
            "is_active", "is_featured", "product_count", "created_at",
        )
        read_only_fields = ("id", "slug", "created_at")


# ---------------------------------------------------------------------------
# Coupons
# ---------------------------------------------------------------------------
class AdminCouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = (
            "id", "code", "description", "discount_type", "discount_value",
            "minimum_order", "maximum_discount", "expiry_date", "usage_limit",
            "times_used", "active", "created_at",
        )
        read_only_fields = ("id", "times_used", "created_at")

    def validate_discount_value(self, value):
        if self.initial_data.get("discount_type") == Coupon.DiscountType.FIXED and value <= 0:
            raise serializers.ValidationError("Fixed discount must be greater than zero.")
        return value


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
class AdminOrderListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    customer_name = serializers.CharField(read_only=True)
    customer_id = serializers.IntegerField(source="user_id", read_only=True)
    item_count = serializers.SerializerMethodField()
    items = OrderItemSerializer(many=True, read_only=True)
    is_tracked = serializers.BooleanField(read_only=True)
    is_refunded = serializers.BooleanField(read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "order_number", "customer_id", "customer_name", "email", "phone",
            "status", "status_display", "payment_status", "payment_status_display",
            "payment_reference", "delivery_method", "subtotal", "shipping_fee",
            "discount", "total", "coupon_code", "item_count", "items",
            "carrier", "tracking_number", "is_tracked",
            "refund_amount", "refund_reason", "refunded_at", "is_refunded",
            "created_at", "updated_at",
        )

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())


class AdminOrderDetailSerializer(AdminOrderListSerializer):
    delivery_method_display = serializers.CharField(source="get_delivery_method_display", read_only=True)
    shipping_address = serializers.JSONField(read_only=True)
    history = serializers.SerializerMethodField()
    tracking = serializers.SerializerMethodField()

    class Meta(AdminOrderListSerializer.Meta):
        fields = AdminOrderListSerializer.Meta.fields + (
            "delivery_method_display", "pickup_location", "shipping_address",
            "customer_note", "staff_note",
            "paid_at", "shipped_at", "delivered_at", "refund_reference",
            "history", "tracking",
        )

    def get_history(self, obj):
        return [
            {"status": h.status, "status_display": h.get_status_display(), "note": h.note, "created_at": h.created_at}
            for h in obj.history.all()
        ]

    def get_tracking(self, obj):
        return tracking_steps(obj)


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrderStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class PaymentStatusUpdateSerializer(serializers.Serializer):
    payment_status = serializers.ChoiceField(choices=PaymentStatus.choices)
    payment_reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class OrderTrackingUpdateSerializer(serializers.Serializer):
    """Carrier details staff record when a parcel leaves the store."""

    carrier = serializers.CharField(required=False, allow_blank=True, max_length=80)
    tracking_number = serializers.CharField(required=False, allow_blank=True, max_length=120)
    staff_note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    mark_shipped = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        # A reference with no carrier is a typo the customer cannot act on, so
        # require the pair together.
        carrier = attrs.get("carrier", "").strip()
        number = attrs.get("tracking_number", "").strip()
        if bool(carrier) != bool(number):
            raise serializers.ValidationError(
                "Enter both a carrier and a tracking number, or leave both blank."
            )
        return attrs


class OrderRefundSerializer(serializers.Serializer):
    """Refund an order, optionally in part."""

    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    reason = serializers.CharField(max_length=255, allow_blank=True)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    restore_stock = serializers.BooleanField(required=False, default=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_amount(self, value):
        order = self.context["order"]
        if order.payment_status != PaymentStatus.PAID:
            raise serializers.ValidationError("Only a paid order can be refunded.")
        if value > order.total:
            raise serializers.ValidationError(
                f"Refund cannot be more than the order total ({order.total})."
            )
        return value


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
class AdminCustomerListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    order_count = serializers.IntegerField(read_only=True, default=0)
    total_spent = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, default=0)

    class Meta:
        model = User
        fields = (
            "id", "first_name", "last_name", "full_name", "email", "phone",
            "is_active", "is_staff", "email_verified", "date_joined",
            "order_count", "total_spent",
        )


class AdminCustomerDetailSerializer(AdminCustomerListSerializer):
    addresses = AddressSerializer(many=True, read_only=True)
    review_count = serializers.SerializerMethodField()

    class Meta(AdminCustomerListSerializer.Meta):
        fields = AdminCustomerListSerializer.Meta.fields + ("addresses", "review_count", "last_login")

    def get_review_count(self, obj):
        return obj.reviews.count()


class AdminCustomerUpdateSerializer(serializers.ModelSerializer):
    """Basic profile edits staff may make.

    `is_staff` is deliberately absent. Granting staff is a privilege change, not
    a profile edit, so it stays behind the superuser-only `set_staff` action.
    Exposing it here would let any staff PATCH a colleague (or themselves) up to
    full admin with a single request.
    """

    class Meta:
        model = User
        fields = ("first_name", "last_name", "phone", "is_active")


# ---------------------------------------------------------------------------
# Reviews & messages
# ---------------------------------------------------------------------------
class AdminReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="user.full_name", read_only=True)
    customer_email = serializers.CharField(source="user.email", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)

    class Meta:
        model = Review
        fields = (
            "id", "user", "customer_name", "customer_email", "product", "product_name",
            "product_slug", "rating", "title", "comment", "is_verified_purchase",
            "is_approved", "created_at",
        )
        read_only_fields = ("id", "user", "product", "is_verified_purchase", "created_at")


class AdminMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ("id", "name", "email", "phone", "subject", "message", "is_resolved", "created_at")
        read_only_fields = ("id", "created_at")
