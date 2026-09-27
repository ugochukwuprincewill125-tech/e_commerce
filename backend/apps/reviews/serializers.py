from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    product_slug = serializers.CharField(source="product.slug", read_only=True)

    class Meta:
        model = Review
        fields = ("id", "product", "product_slug", "rating", "title", "comment", "customer_name", "is_verified_purchase", "is_approved", "created_at")
        read_only_fields = ("id", "customer_name", "is_verified_purchase", "is_approved", "created_at", "product_slug")

    def get_customer_name(self, obj):
        last = f" {obj.user.last_name[:1]}." if obj.user.last_name else ""
        return f"{obj.user.first_name}{last}".strip() or "Customer"

    def validate_comment(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Please write at least 10 characters.")
        return value.strip()
