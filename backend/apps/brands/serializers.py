from rest_framework import serializers

from .models import Brand


class BrandMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ("id", "name", "slug")


class BrandSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Brand
        fields = ("id", "name", "slug", "logo", "description", "website", "is_featured", "product_count")
