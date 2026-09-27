from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html

from .models import Brand


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("thumb", "name", "product_count", "is_featured", "is_active", "website")
    list_display_links = ("thumb", "name")
    list_editable = ("is_featured", "is_active")
    list_filter = ("is_active", "is_featured")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_products=Count("products"))

    @admin.display(description="")
    def thumb(self, obj):
        if obj.logo:
            return format_html('<img src="{}" style="width:40px;height:40px;object-fit:contain;border-radius:8px" />', obj.logo.url)
        return "—"

    @admin.display(description="Products", ordering="_products")
    def product_count(self, obj):
        return obj._products
