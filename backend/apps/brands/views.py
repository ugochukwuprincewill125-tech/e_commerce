from django.db.models import Count, Q
from rest_framework import viewsets

from .models import Brand
from .serializers import BrandSerializer


class BrandViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Only brands that currently have active products in the store are listed,
    so the site never advertises brands Timeline doesn't actually stock.
      ?featured=true   featured brands only
      ?all=true        include brands without products (e.g. for admin tooling)
    """

    serializer_class = BrandSerializer
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        qs = Brand.objects.filter(is_active=True).annotate(
            product_count=Count("products", filter=Q(products__is_active=True))
        )
        params = self.request.query_params
        if params.get("all") not in {"1", "true"}:
            qs = qs.filter(product_count__gt=0)
        if params.get("featured") in {"1", "true"}:
            qs = qs.filter(is_featured=True)
        return qs.order_by("-is_featured", "name")
