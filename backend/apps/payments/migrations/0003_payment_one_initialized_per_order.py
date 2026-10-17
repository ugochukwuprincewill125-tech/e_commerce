"""At most one open (initialized) payment per order and provider.

Application code already reuses an order's initialized payment instead of
issuing a second one; this constraint enforces it at the database layer, so a
race across processes can never produce two Paystack references for the same
order (which is how a customer could end up paying twice).
"""
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0002_payment_refund_note"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                condition=Q(status="initialized"),
                fields=("order", "provider"),
                name="one_initialized_payment_per_order",
            ),
        ),
    ]
