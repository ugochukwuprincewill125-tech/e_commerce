from django.db.models import Count, Max, Min, Prefetch, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.brands.models import Brand
from apps.categories.models import Category

from .filters import ProductFilter, search_q
from .models import Product, ProductImage, ProductType, ProductVariant
from .serializers import ProductDetailSerializer, ProductListSerializer


def base_product_queryset():
    return (
        Product.objects.active()
        .with_effective_price()
        .select_related("brand", "category", "category__parent_category")
        .prefetch_related(
            Prefetch("images", queryset=ProductImage.objects.order_by("display_order", "id")),
            Prefetch("variants", queryset=ProductVariant.objects.filter(is_active=True)),
        )
    )


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/products/                     paginated product list
        ?q=iphone                          search name, SKU, category, brand, description
        ?category=smartphones              category (includes sub-categories)
        ?brand=apple,samsung               brands
        ?min_price=&max_price=             price range (uses sale price when on sale)
        ?rating=4                          minimum rating
        ?in_stock=true  ?on_sale=true  ?min_discount=10
        ?product_type=audio,power
        ?featured=true ?bestseller=true ?new_arrival=true
        ?ordering=effective_price|-effective_price|-created_at|-rating|-review_count|name
        ?page=2&page_size=24
    GET /api/products/<slug>/              product details
    GET /api/products/<slug>/related/      related products
    GET /api/products/facets/              filter options for the shop sidebar
    """

    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"
    filterset_class = ProductFilter
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["effective_price", "created_at", "rating", "review_count", "name"]
    ordering = ("-featured", "-created_at")

    def get_queryset(self):
        return base_product_queryset()

    def get_serializer_class(self):
        return ProductDetailSerializer if self.action == "retrieve" else ProductListSerializer

    @action(detail=True, methods=["get"])
    def related(self, request, slug=None):
        product = self.get_object()
        qs = base_product_queryset().exclude(pk=product.pk)
        same_category = list(qs.filter(category=product.category).order_by("-bestseller", "-rating")[:8])
        if len(same_category) < 8:
            parent_ids = product.category.parent_category.get_descendant_ids() if product.category.parent_category else set()
            more = qs.filter(
                Q(category_id__in=parent_ids) | Q(brand=product.brand)
            ).exclude(pk__in=[p.pk for p in same_category]).order_by("-rating")[: 8 - len(same_category)]
            same_category += list(more)
        return Response(ProductListSerializer(same_category, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"])
    def facets(self, request):
        """Filter options scoped to the current category / search (if any)."""
        qs = Product.objects.active().with_effective_price()
        category_slug = request.query_params.get("category")
        term = request.query_params.get("q", "").strip()
        if category_slug:
            cat = Category.objects.filter(slug=category_slug, is_active=True).first()
            qs = qs.filter(category_id__in=cat.get_descendant_ids()) if cat else qs.none()
        if term:
            qs = qs.filter(search_q(term)).distinct()

        bounds = qs.aggregate(min_price=Min("effective_price"), max_price=Max("effective_price"))
        brands = (
            Brand.objects.filter(products__in=qs).annotate(count=Count("products", filter=Q(products__in=qs)))
            .values("name", "slug", "count").order_by("name").distinct()
        )
        types = qs.values("product_type").annotate(count=Count("id")).order_by("product_type")
        type_labels = dict(ProductType.choices)
        categories = (
            Category.objects.filter(is_active=True, parent_category__isnull=True)
            .values("name", "slug", "icon").order_by("display_order", "name")
        )
        return Response(
            {
                "price": {"min": bounds["min_price"] or 0, "max": bounds["max_price"] or 0},
                "brands": list(brands),
                "product_types": [
                    {"value": t["product_type"], "label": type_labels.get(t["product_type"], t["product_type"]), "count": t["count"]}
                    for t in types
                ],
                "categories": list(categories),
                "on_sale_count": qs.filter(discount_price__isnull=False).count(),
                "in_stock_count": qs.exclude(availability="out_of_stock").count(),
            }
        )


class SearchSuggestionsView(APIView):
    """GET /api/search/suggestions/?q=iph → products, categories and brands."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        term = request.query_params.get("q", "").strip()
        if len(term) < 2:
            return Response({"products": [], "categories": [], "brands": [], "total": 0})

        products_qs = base_product_queryset().filter(search_q(term)).distinct()
        total = products_qs.count()
        products = products_qs.order_by("-bestseller", "-rating")[:6]
        categories = Category.objects.filter(is_active=True).filter(
            Q(name__icontains=term) | Q(products__in=products_qs)
        ).distinct()[:4]
        brands = Brand.objects.filter(is_active=True, products__is_active=True).filter(
            Q(name__icontains=term) | Q(products__in=products_qs)
        ).distinct()[:4]

        def image_url(p):
            imgs = list(p.images.all())
            return request.build_absolute_uri(imgs[0].image.url) if imgs else None

        return Response(
            {
                "total": total,
                "products": [
                    {
                        "id": p.id, "name": p.name, "slug": p.slug, "sku": p.sku,
                        "brand": p.brand.name if p.brand else None,
                        "category": p.category.name,
                        "current_price": str(p.current_price), "price": str(p.price),
                        "image": image_url(p),
                    }
                    for p in products
                ],
                "categories": [{"name": c.name, "slug": c.slug, "icon": c.icon} for c in categories],
                "brands": [{"name": b.name, "slug": b.slug} for b in brands],
            }
        )

