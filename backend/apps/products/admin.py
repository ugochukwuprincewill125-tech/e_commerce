from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.utils.html import format_html

from .models import Availability, Product, ProductImage, ProductVariant


class StockLevelFilter(admin.SimpleListFilter):
    title = "stock level"
    parameter_name = "stock"

    def lookups(self, request, model_admin):
        return (
            ("low", f"Low stock (≤ {settings.LOW_STOCK_THRESHOLD})"),
            ("out", "Out of stock"),
            ("ok", "Healthy stock"),
        )

    def queryset(self, request, queryset):
        if self.value() == "low":
            return queryset.filter(availability=Availability.LOW_STOCK)
        if self.value() == "out":
            return queryset.filter(availability=Availability.OUT_OF_STOCK)
        if self.value() == "ok":
            return queryset.filter(availability=Availability.IN_STOCK)
        return queryset


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("preview", "image", "alt_text", "display_order")
    readonly_fields = ("preview",)

    @admin.display(description="Preview")
    def preview(self, obj):
        if obj.pk and obj.image:
            return format_html('<img src="{}" style="width:64px;height:64px;object-fit:cover;border-radius:8px" />', obj.image.url)
        return "—"


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("variant_type", "value", "sku", "price_adjustment", "stock_quantity", "color_hex", "is_active", "display_order")


class ProductAdminForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = "__all__"
        widgets = {
            "short_description": forms.Textarea(attrs={"rows": 2}),
            "specifications": forms.Textarea(attrs={"rows": 8, "style": "font-family:monospace"}),
        }

    def clean(self):
        data = super().clean()
        price, discount = data.get("price"), data.get("discount_price")
        if price is not None and discount is not None and discount >= price:
            self.add_error("discount_price", "Discount price must be lower than the regular price.")
        specs = data.get("specifications")
        if specs is not None and not isinstance(specs, dict):
            self.add_error("specifications", 'Specifications must be a JSON object, e.g. {"RAM": "8GB"}.')
        return data


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductAdminForm
    list_display = (
        "thumb", "name", "sku", "brand", "category", "price", "discount_price",
        "stock_quantity", "stock_badge", "featured", "bestseller", "new_arrival", "is_active",
    )
    list_display_links = ("thumb", "name")
    list_editable = ("price", "discount_price", "stock_quantity", "featured", "bestseller", "new_arrival", "is_active")
    list_filter = (StockLevelFilter, "is_active", "featured", "bestseller", "new_arrival", "product_type", "category", "brand")
    list_per_page = 40
    search_fields = ("name", "sku", "description", "brand__name", "category__name")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ("category", "brand")
    readonly_fields = ("availability", "rating", "review_count", "created_at", "updated_at")
    inlines = [ProductImageInline, ProductVariantInline]
    actions = ["mark_featured", "unmark_featured", "restock_20", "deactivate"]
    save_on_top = True
    fieldsets = (
        ("Product", {"fields": ("name", "slug", "sku", "category", "brand", "product_type", "short_description", "description", "warranty")}),
        ("Pricing", {"fields": ("price", "discount_price")}),
        ("Inventory", {"fields": ("stock_quantity", "availability")}),
        ("Merchandising", {"fields": ("is_active", "featured", "bestseller", "new_arrival")}),
        ("Specifications", {"fields": ("specifications",)}),
        ("SEO", {"classes": ("collapse",), "fields": ("meta_title", "meta_description")}),
        ("Reviews", {"classes": ("collapse",), "fields": ("rating", "review_count", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("brand", "category").prefetch_related("images")

    @admin.display(description="")
    def thumb(self, obj):
        images = list(obj.images.all())
        if images:
            return format_html('<img src="{}" style="width:44px;height:44px;object-fit:cover;border-radius:8px" />', images[0].image.url)
        return "—"

    @admin.display(description="Status", ordering="availability")
    def stock_badge(self, obj):
        colours = {
            Availability.IN_STOCK: ("#065f46", "#d1fae5"),
            Availability.LOW_STOCK: ("#92400e", "#fef3c7"),
            Availability.OUT_OF_STOCK: ("#991b1b", "#fee2e2"),
        }
        fg, bg = colours.get(obj.availability, ("#111", "#eee"))
        return format_html(
            '<span style="padding:2px 8px;border-radius:999px;font-weight:600;color:{};background:{}">{}</span>',
            fg, bg, obj.get_availability_display(),
        )

    @admin.action(description="Mark selected as featured")
    def mark_featured(self, request, queryset):
        queryset.update(featured=True)

    @admin.action(description="Remove from featured")
    def unmark_featured(self, request, queryset):
        queryset.update(featured=False)

    @admin.action(description="Add 20 units of stock")
    def restock_20(self, request, queryset):
        for product in queryset:
            product.stock_quantity += 20
            product.save(update_fields=["stock_quantity"])
        self.message_user(request, f"Restocked {queryset.count()} product(s).", messages.SUCCESS)

    @admin.action(description="Hide selected products from the store")
    def deactivate(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "variant_type", "value", "sku", "price_adjustment", "stock_quantity", "is_active")
    list_editable = ("price_adjustment", "stock_quantity", "is_active")
    list_filter = ("variant_type", "is_active")
    search_fields = ("product__name", "sku", "value")
    autocomplete_fields = ("product",)
