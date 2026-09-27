from django.db.models import Count, Q
from rest_framework import viewsets

from .models import Category
from .serializers import CategorySerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/categories/            all active categories
      ?root=true                    only top-level categories
      ?featured=true                homepage showcase categories
    GET /api/categories/<slug>/     a single category
    """

    serializer_class = CategorySerializer
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        qs = (
            Category.objects.filter(is_active=True)
            .select_related("parent_category")
            .prefetch_related("children")
            .annotate(
                product_count=Count(
                    "products",
                    filter=Q(products__is_active=True),
                    distinct=True,
                )
                + Count(
                    "children__products",
                    filter=Q(children__products__is_active=True),
                    distinct=True,
                )
            )
        )
        params = self.request.query_params
        if params.get("root") in {"1", "true"}:
            qs = qs.filter(parent_category__isnull=True)
        if params.get("featured") in {"1", "true"}:
            qs = qs.filter(is_featured=True)
        return qs
