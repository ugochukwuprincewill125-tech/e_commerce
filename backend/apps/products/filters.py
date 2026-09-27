import django_filters
from django.db.models import Q

from apps.categories.models import Category

from .models import Availability, Product


def search_q(term):
    """Match product name, SKU, category, brand and descriptions."""
    q = Q()
    for word in term.split():
        q &= (
            Q(name__icontains=word)
            | Q(sku__icontains=word)
            | Q(short_description__icontains=word)
            | Q(description__icontains=word)
            | Q(category__name__icontains=word)
            | Q(category__parent_category__name__icontains=word)
            | Q(brand__name__icontains=word)
        )
    return q


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class ProductFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="filter_search", label="Search")
    category = django_filters.CharFilter(method="filter_category", label="Category slug (includes sub-categories)")
    brand = CharInFilter(field_name="brand__slug", label="Brand slugs, comma separated")
    product_type = CharInFilter(field_name="product_type")
    min_price = django_filters.NumberFilter(field_name="effective_price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="effective_price", lookup_expr="lte")
    rating = django_filters.NumberFilter(field_name="rating", lookup_expr="gte", label="Minimum rating")
    in_stock = django_filters.BooleanFilter(method="filter_in_stock")
    on_sale = django_filters.BooleanFilter(method="filter_on_sale")
    min_discount = django_filters.NumberFilter(method="filter_min_discount", label="Minimum discount %")
    featured = django_filters.BooleanFilter()
    bestseller = django_filters.BooleanFilter()
    new_arrival = django_filters.BooleanFilter()
    slugs = CharInFilter(field_name="slug", label="Specific product slugs, comma separated")
    exclude = django_filters.CharFilter(method="filter_exclude")

    class Meta:
        model = Product
        fields = []

    def filter_search(self, queryset, name, value):
        value = value.strip()
        return queryset.filter(search_q(value)).distinct() if value else queryset

    def filter_category(self, queryset, name, value):
        category = Category.objects.filter(slug=value, is_active=True).first()
        if not category:
            return queryset.none()
        return queryset.filter(category_id__in=category.get_descendant_ids())

    def filter_in_stock(self, queryset, name, value):
        if value:
            return queryset.exclude(availability=Availability.OUT_OF_STOCK)
        return queryset

    def filter_on_sale(self, queryset, name, value):
        if value:
            return queryset.filter(discount_price__isnull=False)
        return queryset

    def filter_min_discount(self, queryset, name, value):
        # discount % >= value  <=>  discount_price <= price * (1 - value/100)
        from django.db.models import F

        ratio = 1 - (float(value) / 100)
        return queryset.filter(discount_price__isnull=False, discount_price__lte=F("price") * ratio)

    def filter_exclude(self, queryset, name, value):
        return queryset.exclude(slug=value)
