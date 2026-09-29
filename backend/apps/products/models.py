from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.text import slugify

from apps.core.models import TimeStampedModel


class Availability(models.TextChoices):
    IN_STOCK = "in_stock", "In Stock"
    LOW_STOCK = "low_stock", "Low Stock"
    OUT_OF_STOCK = "out_of_stock", "Out of Stock"


class ProductType(models.TextChoices):
    DEVICE = "device", "Devices"
    COMPUTING = "computing", "Computing"
    AUDIO = "audio", "Audio"
    WEARABLE = "wearable", "Wearables"
    POWER = "power", "Power & Charging"
    STORAGE = "storage", "Storage"
    NETWORKING = "networking", "Networking"
    ACCESSORY = "accessory", "Accessories"
    GAMING = "gaming", "Gaming"
    SECURITY = "security", "Security"
    SOFTWARE = "software", "Software"


def compute_availability(quantity):
    if quantity <= 0:
        return Availability.OUT_OF_STOCK
    if quantity <= settings.LOW_STOCK_THRESHOLD:
        return Availability.LOW_STOCK
    return Availability.IN_STOCK


class ProductQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True, category__is_active=True)

    def archived(self):
        return self.filter(deleted_at__isnull=False)

    def with_effective_price(self):
        return self.annotate(
            effective_price=Coalesce("discount_price", "price")
        )


class Product(TimeStampedModel):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    sku = models.CharField("SKU", max_length=60, unique=True)
    short_description = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey("categories.Category", on_delete=models.PROTECT, related_name="products")
    brand = models.ForeignKey("brands.Brand", on_delete=models.SET_NULL, null=True, blank=True, related_name="products")
    product_type = models.CharField(max_length=20, choices=ProductType.choices, default=ProductType.ACCESSORY)

    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    discount_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0"))],
        help_text="Leave blank when the product is not on sale.",
    )
    stock_quantity = models.PositiveIntegerField(default=0)
    availability = models.CharField(max_length=20, choices=Availability.choices, default=Availability.OUT_OF_STOCK, editable=False)

    featured = models.BooleanField(default=False)
    bestseller = models.BooleanField(default=False)
    new_arrival = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, help_text="Untick to hide the product from the store.")
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)

    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0, editable=False)
    review_count = models.PositiveIntegerField(default=0, editable=False)
    specifications = models.JSONField(default=dict, blank=True, help_text='Key/value pairs, e.g. {"Display": "6.1\\""}')
    warranty = models.CharField(max_length=120, blank=True)

    meta_title = models.CharField(max_length=70, blank=True)
    meta_description = models.CharField(max_length=160, blank=True)

    objects = ProductQuerySet.as_manager()

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["is_active", "featured"]),
            models.Index(fields=["is_active", "bestseller"]),
            models.Index(fields=["is_active", "new_arrival"]),
            models.Index(fields=["availability"]),
            models.Index(fields=["price"]),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:200] or "product"
            slug, n = base, 2
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        if self.discount_price is not None and self.discount_price >= self.price:
            self.discount_price = None
        self.availability = compute_availability(self.stock_quantity)
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "stock_quantity" in update_fields:
            kwargs["update_fields"] = set(update_fields) | {"availability"}
        super().save(*args, **kwargs)

    @property
    def current_price(self):
        return self.discount_price if self.discount_price is not None else self.price

    @property
    def discount_percent(self):
        if self.discount_price is None or not self.price:
            return 0
        return int(round((1 - self.discount_price / self.price) * 100))

    @property
    def is_low_stock(self):
        return self.availability == Availability.LOW_STOCK

    @property
    def is_in_stock(self):
        return self.stock_quantity > 0

    def archive(self):
        """Soft delete the product."""
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["deleted_at", "is_active", "updated_at"])

    def restore(self):
        """Restore a previously archived product."""
        self.deleted_at = None
        self.is_active = True
        self.save(update_fields=["deleted_at", "is_active", "updated_at"])


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="products/")
    alt_text = models.CharField(max_length=200, blank=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self):
        return self.alt_text or f"Image for {self.product}"

    def save(self, *args, **kwargs):
        if not self.alt_text:
            self.alt_text = self.product.name
        super().save(*args, **kwargs)


class VariantType(models.TextChoices):
    COLOR = "color", "Colour"
    STORAGE = "storage", "Storage"
    RAM = "ram", "RAM"
    CAPACITY = "capacity", "Capacity"
    MODEL = "model", "Model"


class ProductVariant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    variant_type = models.CharField(max_length=20, choices=VariantType.choices)
    value = models.CharField(max_length=80, help_text="e.g. Midnight Black, 256GB, 16GB")
    sku = models.CharField("SKU", max_length=60, unique=True)
    price_adjustment = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Added to the product price (can be negative).",
    )
    stock_quantity = models.PositiveIntegerField(default=0)
    color_hex = models.CharField(max_length=7, blank=True, help_text="Optional swatch colour, e.g. #1F2937")
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("variant_type", "display_order", "id")
        unique_together = ("product", "variant_type", "value")

    def __str__(self):
        return f"{self.product.name} — {self.get_variant_type_display()}: {self.value}"

    @property
    def label(self):
        return f"{self.get_variant_type_display()}: {self.value}"

    def unit_price(self):
        return max(self.product.current_price + self.price_adjustment, Decimal("0"))
