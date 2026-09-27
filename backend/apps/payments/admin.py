from django.contrib import admin

from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("reference", "order", "provider", "amount", "status", "channel", "created_at", "verified_at")
    list_filter = ("status", "provider", "channel")
    search_fields = ("reference", "order__order_number", "order__email")
    readonly_fields = [f.name for f in Payment._meta.fields]

    def has_add_permission(self, request):
        return False
