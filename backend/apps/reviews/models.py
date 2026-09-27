from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


def default_approval():
    return not settings.REVIEWS_REQUIRE_APPROVAL


class Review(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    product = models.ForeignKey("products.Product", on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    title = models.CharField(max_length=120, blank=True)
    comment = models.TextField(max_length=2000)
    is_verified_purchase = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=default_approval)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        unique_together = ("user", "product")

    def __str__(self):
        return f"{self.rating}★ {self.product} by {self.user}"
