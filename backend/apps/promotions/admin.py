from django.contrib import admin

from .models import Coupon


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ("code", "discount_type", "discount_value", "minimum_order", "expiry_date", "times_used", "usage_limit", "active")
    list_editable = ("active",)
    list_filter = ("active", "discount_type")
    search_fields = ("code", "description")
    readonly_fields = ("times_used", "created_at")
    actions = ["activate", "deactivate"]

    @admin.action(description="Activate selected coupons")
    def activate(self, request, queryset):
        queryset.update(active=True)

    @admin.action(description="Deactivate selected coupons")
    def deactivate(self, request, queryset):
        queryset.update(active=False)
