import secrets
import string

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class OrderStatus(models.TextChoices):
    PLACED = "placed", "Order Placed"
    PAYMENT_CONFIRMED = "payment_confirmed", "Payment Confirmed"
    PROCESSING = "processing", "Processing"
    READY_FOR_DELIVERY = "ready_for_delivery", "Ready for Delivery"
    SHIPPED = "shipped", "Shipped"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"


# The customer-facing tracking timeline, in order.
STATUS_FLOW = [
    OrderStatus.PLACED,
    OrderStatus.PAYMENT_CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
]


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"
    FAILED = "failed", "Failed"
    REFUNDED = "refunded", "Refunded"


class DeliveryMethod(models.TextChoices):
    DELIVERY = "delivery", "Home / Office Delivery"
    PICKUP = "pickup", "Store Pickup (Computer Village)"


def generate_order_number():
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(5))
    return f"TGS-{timezone.localdate():%y%m%d}-{suffix}"


class Order(TimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    order_number = models.CharField(max_length=30, unique=True, editable=False)
    status = models.CharField(max_length=30, choices=OrderStatus.choices, default=OrderStatus.PLACED)
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    payment_reference = models.CharField(max_length=100, blank=True, db_index=True)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    shipping_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2)
    coupon = models.ForeignKey("promotions.Coupon", on_delete=models.SET_NULL, null=True, blank=True, related_name="orders")
    coupon_code = models.CharField(max_length=40, blank=True)

    # Customer & delivery snapshot (kept even if the customer later edits their profile/addresses)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    delivery_method = models.CharField(max_length=20, choices=DeliveryMethod.choices, default=DeliveryMethod.DELIVERY)
    pickup_location = models.CharField(max_length=40, blank=True)
    shipping_address = models.JSONField(default=dict, blank=True)
    customer_note = models.TextField(blank=True, max_length=1000)

    paid_at = models.DateTimeField(null=True, blank=True)
    stock_restored = models.BooleanField(default=False, editable=False)

    # Fulfilment tracking. Staff fill these in when the parcel leaves, so a
    # shopper and the store can both see the same reference. `tracking_number`
    # is what makes an order "tracked" — see the `is_tracked` property.
    carrier = models.CharField(max_length=80, blank=True)
    tracking_number = models.CharField(max_length=120, blank=True, db_index=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    staff_note = models.TextField(blank=True, max_length=2000)

    # Refunds. A refund is a real event, not just a payment_status flip, so the
    # amount, reference, reason and moment are all recorded for the books.
    refund_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    refund_reference = models.CharField(max_length=120, blank=True)
    refund_reason = models.CharField(max_length=255, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["payment_status"]),
            models.Index(fields=["tracking_number"]),
        ]

    def __str__(self):
        return self.order_number

    def save(self, *args, **kwargs):
        if not self.order_number:
            number = generate_order_number()
            while Order.objects.filter(order_number=number).exists():
                number = generate_order_number()
            self.order_number = number
        super().save(*args, **kwargs)

    @property
    def customer_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_paid(self):
        return self.payment_status == PaymentStatus.PAID

    @property
    def is_tracked(self):
        """True once staff have logged a carrier reference for this parcel.

        An order that is still in the warehouse has nothing to track yet, so the
        admin can list tracked and untracked fulfilment work separately.
        """
        return bool(self.tracking_number.strip())

    @property
    def is_refunded(self):
        return self.payment_status == PaymentStatus.REFUNDED

    @property
    def can_cancel(self):
        return self.status == OrderStatus.PLACED and self.payment_status != PaymentStatus.PAID

    @property
    def can_pay(self):
        return self.status == OrderStatus.PLACED and self.payment_status in (PaymentStatus.PENDING, PaymentStatus.FAILED)

    def formatted_address(self):
        a = self.shipping_address or {}
        parts = [a.get("address"), a.get("city"), a.get("state"), a.get("country"), a.get("postal_code")]
        return ", ".join(p for p in parts if p)

    def add_history(self, status, note=""):
        return OrderStatusHistory.objects.create(order=self, status=status, note=note)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("products.Product", on_delete=models.SET_NULL, null=True, blank=True, related_name="order_items")
    variant = models.ForeignKey("products.ProductVariant", on_delete=models.SET_NULL, null=True, blank=True, related_name="order_items")
    product_name = models.CharField(max_length=200)
    product_sku = models.CharField(max_length=60, blank=True)
    variant_label = models.CharField(max_length=120, blank=True)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.quantity} × {self.product_name}"


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="history")
    status = models.CharField(max_length=30, choices=OrderStatus.choices)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        verbose_name_plural = "order status history"

    def __str__(self):
        return f"{self.order} → {self.get_status_display()}"
