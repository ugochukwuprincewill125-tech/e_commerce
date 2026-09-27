from rest_framework import serializers

from .models import DeliveryMethod, Order, OrderItem, OrderStatusHistory
from .services import tracking_steps


class OrderItemSerializer(serializers.ModelSerializer):
    product_slug = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ("id", "product", "product_slug", "product_name", "product_sku", "variant_label", "quantity", "unit_price", "total_price", "image")

    def get_product_slug(self, obj):
        return obj.product.slug if obj.product_id and obj.product else None

    def get_image(self, obj):
        if not obj.product_id or not obj.product:
            return None
        images = list(obj.product.images.all())
        if not images:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(images[0].image.url) if request else images[0].image.url


class OrderHistorySerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = OrderStatusHistory
        fields = ("status", "status_display", "note", "created_at")


class OrderListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    item_count = serializers.SerializerMethodField()
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "order_number", "status", "status_display", "payment_status", "payment_status_display",
            "total", "item_count", "items", "created_at", "can_pay",
        )

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())


class OrderDetailSerializer(OrderListSerializer):
    delivery_method_display = serializers.CharField(source="get_delivery_method_display", read_only=True)
    history = OrderHistorySerializer(many=True, read_only=True)
    tracking = serializers.SerializerMethodField()

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + (
            "subtotal", "shipping_fee", "discount", "coupon_code", "first_name", "last_name", "email", "phone",
            "delivery_method", "delivery_method_display", "pickup_location", "shipping_address",
            "customer_note", "payment_reference", "paid_at", "can_cancel", "history", "tracking", "updated_at",
        )

    def get_tracking(self, obj):
        return tracking_steps(obj)


class PublicTrackingSerializer(serializers.ModelSerializer):
    """Limited view for the public 'track my order' form."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    tracking = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ("order_number", "status", "status_display", "payment_status", "payment_status_display", "item_count", "created_at", "tracking")

    def get_tracking(self, obj):
        return tracking_steps(obj)

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())


PICKUP_LOCATIONS = ("main-office", "branch")


class CreateOrderSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=80)
    last_name = serializers.CharField(max_length=80)
    email = serializers.EmailField()
    phone = serializers.RegexField(r"^\+?[0-9\s\-()]{7,20}$", error_messages={"invalid": "Enter a valid phone number."})
    delivery_method = serializers.ChoiceField(choices=DeliveryMethod.choices, default=DeliveryMethod.DELIVERY)
    pickup_location = serializers.ChoiceField(choices=PICKUP_LOCATIONS, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    state = serializers.CharField(max_length=80, required=False, allow_blank=True)
    country = serializers.CharField(max_length=80, required=False, allow_blank=True, default="Nigeria")
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    coupon_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    save_address = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs.get("delivery_method") == DeliveryMethod.DELIVERY:
            missing = {f: "This field is required for delivery." for f in ("address", "city", "state") if not attrs.get(f, "").strip()}
            if missing:
                raise serializers.ValidationError(missing)
        else:
            if not attrs.get("pickup_location"):
                attrs["pickup_location"] = "main-office"
        return attrs


class TrackOrderSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=30)
    email = serializers.EmailField()
