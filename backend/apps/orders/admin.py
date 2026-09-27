from django.contrib import admin, messages
from django.urls import reverse
from django.utils.html import format_html

from .models import Order, OrderItem, OrderStatus, OrderStatusHistory, PaymentStatus
from .services import cancel_order, mark_order_paid

STATUS_COLOURS = {
    OrderStatus.PLACED: "#6b7280",
    OrderStatus.PAYMENT_CONFIRMED: "#2563eb",
    OrderStatus.PROCESSING: "#7c3aed",
    OrderStatus.READY_FOR_DELIVERY: "#0891b2",
    OrderStatus.SHIPPED: "#d97706",
    OrderStatus.DELIVERED: "#059669",
    OrderStatus.CANCELLED: "#dc2626",
}
PAYMENT_COLOURS = {
    PaymentStatus.PENDING: "#6b7280",
    PaymentStatus.PAID: "#059669",
    PaymentStatus.FAILED: "#dc2626",
    PaymentStatus.REFUNDED: "#d97706",
}


def pill(text, colour):
    return format_html(
        '<span style="padding:2px 10px;border-radius:999px;color:#fff;background:{};font-weight:600;font-size:11px">{}</span>',
        colour, text,
    )


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    fields = ("product_link", "product_sku", "variant_label", "quantity", "unit_price", "total_price")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description="Product")
    def product_link(self, obj):
        if obj.product_id:
            return format_html('<a href="{}">{}</a>', reverse("admin:products_product_change", args=[obj.product_id]), obj.product_name)
        return obj.product_name


class OrderHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    can_delete = False
    fields = ("status", "note", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "customer", "created_at", "item_count", "total_display", "status_pill", "payment_pill", "status", "payment_status")
    list_editable = ("status", "payment_status")
    list_filter = ("status", "payment_status", "delivery_method", "created_at")
    search_fields = ("order_number", "email", "first_name", "last_name", "phone", "payment_reference")
    date_hierarchy = "created_at"
    list_per_page = 30
    inlines = [OrderItemInline, OrderHistoryInline]
    actions = ["action_processing", "action_ready", "action_shipped", "action_delivered", "action_mark_paid", "action_cancel"]
    readonly_fields = (
        "order_number", "user_link", "subtotal", "shipping_fee", "discount", "total", "coupon_code",
        "payment_reference", "paid_at", "created_at", "updated_at", "formatted_shipping",
    )
    fieldsets = (
        ("Order", {"fields": ("order_number", "user_link", "status", "payment_status", "created_at", "updated_at")}),
        ("Customer", {"fields": ("first_name", "last_name", "email", "phone")}),
        ("Delivery", {"fields": ("delivery_method", "pickup_location", "formatted_shipping", "customer_note")}),
        ("Amounts (₦, calculated by the server)", {"fields": ("subtotal", "discount", "shipping_fee", "total", "coupon_code")}),
        ("Payment", {"fields": ("payment_reference", "paid_at")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user").prefetch_related("items")

    @admin.display(description="Customer", ordering="last_name")
    def customer(self, obj):
        return format_html("{}<br><small>{}</small>", obj.customer_name, obj.email)

    @admin.display(description="Customer account")
    def user_link(self, obj):
        return format_html('<a href="{}">{}</a>', reverse("admin:users_user_change", args=[obj.user_id]), obj.user.email)

    @admin.display(description="Items")
    def item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())

    @admin.display(description="Total", ordering="total")
    def total_display(self, obj):
        return f"₦{obj.total:,.2f}"

    @admin.display(description="Order status")
    def status_pill(self, obj):
        return pill(obj.get_status_display(), STATUS_COLOURS.get(obj.status, "#111"))

    @admin.display(description="Payment")
    def payment_pill(self, obj):
        return pill(obj.get_payment_status_display(), PAYMENT_COLOURS.get(obj.payment_status, "#111"))

    @admin.display(description="Delivery address")
    def formatted_shipping(self, obj):
        if obj.delivery_method == "pickup":
            return f"Store pickup — {obj.pickup_location or 'main-office'}"
        return obj.formatted_address() or "—"

    def save_model(self, request, obj, form, change):
        status_changed = change and "status" in form.changed_data
        payment_changed = change and "payment_status" in form.changed_data
        if status_changed and obj.status == OrderStatus.CANCELLED:
            # Save other edits first, then cancel through the service so stock is returned.
            obj.status = form.initial.get("status", OrderStatus.PLACED)
            super().save_model(request, obj, form, change)
            cancel_order(obj, note=f"Cancelled by {request.user.email}.")
            obj.refresh_from_db()
            return
        super().save_model(request, obj, form, change)
        if payment_changed and obj.payment_status == PaymentStatus.PAID and not obj.paid_at:
            from django.utils import timezone

            obj.paid_at = timezone.now()
            obj.save(update_fields=["paid_at"])
        if status_changed:
            obj.add_history(obj.status, f"Updated by {request.user.email}.")

    def _bulk_status(self, request, queryset, status):
        count = 0
        for order in queryset.exclude(status__in=[status, OrderStatus.CANCELLED]):
            order.status = status
            order.save(update_fields=["status", "updated_at"])
            order.add_history(status, f"Updated by {request.user.email}.")
            count += 1
        self.message_user(request, f"{count} order(s) marked as {OrderStatus(status).label}.", messages.SUCCESS)

    @admin.action(description="Mark as Processing")
    def action_processing(self, request, queryset):
        self._bulk_status(request, queryset, OrderStatus.PROCESSING)

    @admin.action(description="Mark as Ready for Delivery")
    def action_ready(self, request, queryset):
        self._bulk_status(request, queryset, OrderStatus.READY_FOR_DELIVERY)

    @admin.action(description="Mark as Shipped")
    def action_shipped(self, request, queryset):
        self._bulk_status(request, queryset, OrderStatus.SHIPPED)

    @admin.action(description="Mark as Delivered")
    def action_delivered(self, request, queryset):
        self._bulk_status(request, queryset, OrderStatus.DELIVERED)

    @admin.action(description="Mark as Paid (bank transfer / POS confirmed manually)")
    def action_mark_paid(self, request, queryset):
        for order in queryset:
            mark_order_paid(order, order.payment_reference or f"MANUAL-{order.order_number}", note=f"Payment confirmed manually by {request.user.email}.")
        self.message_user(request, "Selected orders marked as paid.", messages.SUCCESS)

    @admin.action(description="Cancel orders and return stock")
    def action_cancel(self, request, queryset):
        for order in queryset:
            cancel_order(order, note=f"Cancelled by {request.user.email}.")
        self.message_user(request, "Selected orders cancelled; reserved stock returned to inventory.", messages.SUCCESS)
