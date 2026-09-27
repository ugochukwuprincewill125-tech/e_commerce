from decimal import ROUND_HALF_UP, Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class Coupon(models.Model):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage (%)"
        FIXED = "fixed", "Fixed amount (₦)"

    code = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=200, blank=True)
    discount_type = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.PERCENTAGE)
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    minimum_order = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    maximum_discount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Optional cap for percentage coupons (₦).",
    )
    expiry_date = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Leave blank for unlimited uses.")
    times_used = models.PositiveIntegerField(default=0, editable=False)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.code

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def check_valid(self, subtotal):
        """Return (is_valid, message)."""
        if not self.active:
            return False, "This coupon is no longer active."
        if self.expiry_date and self.expiry_date < timezone.now():
            return False, "This coupon has expired."
        if self.usage_limit is not None and self.times_used >= self.usage_limit:
            return False, "This coupon has reached its usage limit."
        if subtotal < self.minimum_order:
            return False, f"This coupon requires a minimum order of ₦{self.minimum_order:,.0f}."
        return True, "Coupon applied."

    def discount_for(self, subtotal):
        subtotal = Decimal(subtotal)
        if self.discount_type == self.DiscountType.PERCENTAGE:
            amount = (subtotal * self.discount_value / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if self.maximum_discount is not None:
                amount = min(amount, self.maximum_discount)
        else:
            amount = self.discount_value
        return min(amount, subtotal)
