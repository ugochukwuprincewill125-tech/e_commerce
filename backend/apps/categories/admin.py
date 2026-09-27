from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html

from .models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("thumb", "name", "parent_category", "product_count", "is_featured", "is_active", "display_order")
    list_display_links = ("thumb", "name")
    list_editable = ("is_featured", "is_active", "display_order")
    list_filter = ("is_active", "is_featured", "parent_category")
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ("parent_category",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("parent_category").annotate(_products=Count("products"))

    @admin.display(description="")
    def thumb(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="width:40px;height:40px;object-fit:cover;border-radius:8px" />', obj.image.url)
        return "—"

    @admin.display(description="Products", ordering="_products")
    def product_count(self, obj):
        return obj._products
