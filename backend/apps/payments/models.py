from django.db import models


class Payment(models.Model):
    class Status(models.TextChoices):
        INITIALIZED = "initialized", "Initialized"
        SUCCESS = "success", "Successful"
        FAILED = "failed", "Failed"
        ABANDONED = "abandoned", "Abandoned"

    class Provider(models.TextChoices):
        PAYSTACK = "paystack", "Paystack"
        TEST = "test", "Test mode (no real charge)"

    order = models.ForeignKey("orders.Order", on_delete=models.CASCADE, related_name="payments")
    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.PAYSTACK)
    reference = models.CharField(max_length=100, unique=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, help_text="Amount in Naira, copied from the order total.")
    currency = models.CharField(max_length=3, default="NGN")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIALIZED)
    authorization_url = models.URLField(blank=True, max_length=500)
    gateway_response = models.CharField(max_length=255, blank=True)
    channel = models.CharField(max_length=40, blank=True)
    raw_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.reference} ({self.get_status_display()})"
