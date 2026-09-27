from django.conf import settings
from django.db import models


class Wishlist(models.Model):
    """One row per saved product (user ↔ product)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist_items")
    product = models.ForeignKey("products.Product", on_delete=models.CASCADE, related_name="wishlisted_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        unique_together = ("user", "product")
        verbose_name = "wishlist item"

    def __str__(self):
        return f"{self.user} ♥ {self.product}"
