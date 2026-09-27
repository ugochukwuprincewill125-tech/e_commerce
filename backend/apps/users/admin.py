from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count, Q, Sum
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from .models import Address, User


class AddressInline(admin.TabularInline):
    model = Address
    extra = 0
    fields = ("label", "first_name", "last_name", "phone", "address", "city", "state", "is_default")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-date_joined",)
    list_display = ("email", "full_name", "phone", "email_verified", "order_count", "total_spent", "is_staff", "date_joined")
    list_filter = ("is_staff", "is_active", "email_verified", "date_joined")
    search_fields = ("email", "first_name", "last_name", "phone")
    readonly_fields = ("date_joined", "last_login", "order_history")
    inlines = [AddressInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone", "profile_image")}),
        ("Status", {"fields": ("is_active", "email_verified", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Activity", {"fields": ("date_joined", "last_login", "order_history")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "first_name", "last_name", "password1", "password2")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _order_count=Count("orders", distinct=True),
            _total_spent=Sum("orders__total", filter=Q(orders__payment_status="paid")),
        )

    @admin.display(description="Name")
    def full_name(self, obj):
        return obj.full_name

    @admin.display(description="Orders", ordering="_order_count")
    def order_count(self, obj):
        url = reverse("admin:orders_order_changelist") + f"?user__id__exact={obj.pk}"
        return format_html('<a href="{}">{}</a>', url, obj._order_count)

    @admin.display(description="Total spent (₦)", ordering="_total_spent")
    def total_spent(self, obj):
        return f"{obj._total_spent or 0:,.2f}"

    @admin.display(description="Order history")
    def order_history(self, obj):
        orders = obj.orders.all()[:15]
        if not orders:
            return "No orders yet."
        rows = format_html_join(
            "",
            '<tr><td><a href="{}">{}</a></td><td>{}</td><td>{}</td><td>{}</td><td>₦{}</td></tr>',
            (
                (
                    reverse("admin:orders_order_change", args=[o.pk]),
                    o.order_number,
                    o.created_at.strftime("%d %b %Y"),
                    o.get_status_display(),
                    o.get_payment_status_display(),
                    f"{o.total:,.2f}",
                )
                for o in orders
            ),
        )
        return format_html(
            '<table><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>'
            "<tbody>{}</tbody></table>",
            rows,
        )


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("user", "first_name", "last_name", "city", "state", "is_default")
    list_filter = ("state", "is_default")
    search_fields = ("user__email", "first_name", "last_name", "address", "city")
    autocomplete_fields = ("user",)
