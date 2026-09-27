from rest_framework import serializers

from .models import Category


class CategoryMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "icon")


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True, default=0)
    parent = CategoryMiniSerializer(source="parent_category", read_only=True)
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id", "name", "slug", "description", "image", "icon", "parent",
            "children", "is_featured", "product_count",
        )

    def get_children(self, obj):
        children = [c for c in obj.children.all() if c.is_active]
        return CategoryMiniSerializer(children, many=True).data
