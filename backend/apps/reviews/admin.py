from django.contrib import admin

from .models import Review
from .signals import refresh_product_rating


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("product", "user", "stars", "title", "is_verified_purchase", "is_approved", "created_at")
    list_editable = ("is_approved",)
    list_filter = ("is_approved", "rating", "is_verified_purchase", "created_at")
    search_fields = ("product__name", "user__email", "title", "comment")
    autocomplete_fields = ("product", "user")
    actions = ["approve", "unapprove"]

    @admin.display(description="Rating", ordering="rating")
    def stars(self, obj):
        return "★" * obj.rating + "☆" * (5 - obj.rating)

    def _refresh(self, queryset):
        for product_id in set(queryset.values_list("product_id", flat=True)):
            refresh_product_rating(product_id)

    @admin.action(description="Approve selected reviews")
    def approve(self, request, queryset):
        queryset.update(is_approved=True)
        self._refresh(queryset)

    @admin.action(description="Hide selected reviews")
    def unapprove(self, request, queryset):
        queryset.update(is_approved=False)
        self._refresh(queryset)
