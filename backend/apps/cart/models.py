import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Cart(models.Model):
    """
    A signed-in customer has exactly one cart. Guests get a cart identified by
    an unguessable UUID the browser sends in the `X-Cart-Session` header; it is
    merged into the customer's cart when they sign in.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="cart")
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return f"Cart of {self.user}" if self.user_id else f"Guest cart {self.session_id}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("products.Product", on_delete=models.CASCADE, related_name="cart_items")
    selected_variant = models.ForeignKey(
        "products.ProductVariant", on_delete=models.CASCADE, null=True, blank=True, related_name="cart_items"
    )
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("added_at", "id")
        constraints = [
            models.UniqueConstraint(fields=["cart", "product", "selected_variant"], name="unique_cart_line"),
            models.UniqueConstraint(
                fields=["cart", "product"], condition=models.Q(selected_variant__isnull=True), name="unique_cart_line_no_variant"
            ),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.product}"

    @property
    def unit_price(self):
        if self.selected_variant_id:
            return self.selected_variant.unit_price()
        return self.product.current_price

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    @property
    def available_stock(self):
        if self.selected_variant_id:
            return min(self.selected_variant.stock_quantity, self.product.stock_quantity)
        return self.product.stock_quantity
