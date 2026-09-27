from django.db.models import Count
from rest_framework import serializers

from apps.brands.serializers import BrandMiniSerializer
from apps.categories.serializers import CategoryMiniSerializer

from .models import Product, ProductImage, ProductVariant


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "display_order")


class ProductVariantSerializer(serializers.ModelSerializer):
    variant_type_display = serializers.CharField(source="get_variant_type_display", read_only=True)
    price = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = (
            "id", "variant_type", "variant_type_display", "value", "sku", "price_adjustment",
            "price", "stock_quantity", "in_stock", "color_hex",
        )

    def get_price(self, obj):
        return str(obj.unit_price())

    def get_in_stock(self, obj):
        return obj.stock_quantity > 0


class ProductListSerializer(serializers.ModelSerializer):
    brand = BrandMiniSerializer(read_only=True)
    category = CategoryMiniSerializer(read_only=True)
    current_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discount_percent = serializers.IntegerField(read_only=True)
    availability_display = serializers.CharField(source="get_availability_display", read_only=True)
    product_type_display = serializers.CharField(source="get_product_type_display", read_only=True)
    image = serializers.SerializerMethodField()
    hover_image = serializers.SerializerMethodField()
    has_variants = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id", "name", "slug", "sku", "short_description", "brand", "category",
            "product_type", "product_type_display", "price", "discount_price", "current_price",
            "discount_percent", "stock_quantity", "availability", "availability_display",
            "featured", "bestseller", "new_arrival", "rating", "review_count",
            "image", "hover_image", "has_variants",
        )

    def _image_url(self, obj, index):
        images = list(obj.images.all())
        if len(images) <= index:
            return None
        request = self.context.get("request")
        url = images[index].image.url
        return request.build_absolute_uri(url) if request else url

    def get_image(self, obj):
        return self._image_url(obj, 0)

    def get_hover_image(self, obj):
        return self._image_url(obj, 1)

    def get_has_variants(self, obj):
        return any(v.is_active for v in obj.variants.all())


class ProductDetailSerializer(ProductListSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    variants = serializers.SerializerMethodField()
    rating_breakdown = serializers.SerializerMethodField()
    breadcrumbs = serializers.SerializerMethodField()

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + (
            "description", "specifications", "warranty", "images", "variants",
            "rating_breakdown", "breadcrumbs", "meta_title", "meta_description",
            "created_at", "updated_at",
        )

    def get_variants(self, obj):
        return ProductVariantSerializer([v for v in obj.variants.all() if v.is_active], many=True).data

    def get_rating_breakdown(self, obj):
        rows = (
            obj.reviews.filter(is_approved=True)
            .values("rating")
            .annotate(total=Count("id"))
        )
        breakdown = {str(star): 0 for star in range(5, 0, -1)}
        for row in rows:
            breakdown[str(row["rating"])] = row["total"]
        return breakdown

    def get_breadcrumbs(self, obj):
        crumbs, cat, seen = [], obj.category, set()
        while cat and cat.pk not in seen:
            seen.add(cat.pk)
            crumbs.insert(0, {"name": cat.name, "slug": cat.slug})
            cat = cat.parent_category
        return crumbs
