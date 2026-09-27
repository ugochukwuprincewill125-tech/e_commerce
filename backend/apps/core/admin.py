from django.conf import settings
from django.contrib import admin
from django.db.models import Sum

from .models import ContactMessage


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("subject", "name", "email", "phone", "is_resolved", "created_at")
    list_editable = ("is_resolved",)
    list_filter = ("is_resolved", "created_at")
    search_fields = ("name", "email", "subject", "message")
    readonly_fields = ("name", "email", "phone", "subject", "message", "created_at")


# ---------------------------------------------------------------------------
# Inventory & sales snapshot on the admin home page
# ---------------------------------------------------------------------------
_original_index = admin.site.index


def dashboard_index(request, extra_context=None):
    from apps.orders.models import Order, OrderStatus, PaymentStatus
    from apps.products.models import Availability, Product

    extra_context = extra_context or {}
    if request.user.is_active and request.user.is_staff:
        products = Product.objects.filter(is_active=True)
        extra_context["inventory"] = {
            "threshold": settings.LOW_STOCK_THRESHOLD,
            "total": products.count(),
            "low": products.filter(availability=Availability.LOW_STOCK).order_by("stock_quantity")[:10],
            "low_count": products.filter(availability=Availability.LOW_STOCK).count(),
            "out": products.filter(availability=Availability.OUT_OF_STOCK)[:10],
            "out_count": products.filter(availability=Availability.OUT_OF_STOCK).count(),
        }
        paid = Order.objects.filter(payment_status=PaymentStatus.PAID)
        extra_context["sales"] = {
            "revenue": paid.aggregate(total=Sum("total"))["total"] or 0,
            "paid_orders": paid.count(),
            "to_fulfil": Order.objects.filter(
                status__in=[OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_DELIVERY]
            ).count(),
            "awaiting_payment": Order.objects.filter(status=OrderStatus.PLACED, payment_status=PaymentStatus.PENDING).count(),
            "unread_messages": ContactMessage.objects.filter(is_resolved=False).count(),
        }
    return _original_index(request, extra_context)


admin.site.index = dashboard_index
