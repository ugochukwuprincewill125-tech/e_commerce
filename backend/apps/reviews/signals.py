from decimal import Decimal

from django.db.models import Avg, Count
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Review


def refresh_product_rating(product_id):
    from apps.products.models import Product

    stats = Review.objects.filter(product_id=product_id, is_approved=True).aggregate(avg=Avg("rating"), total=Count("id"))
    Product.objects.filter(pk=product_id).update(
        rating=Decimal(stats["avg"] or 0).quantize(Decimal("0.01")),
        review_count=stats["total"] or 0,
    )


@receiver(post_save, sender=Review)
def review_saved(sender, instance, **kwargs):
    refresh_product_rating(instance.product_id)


@receiver(post_delete, sender=Review)
def review_deleted(sender, instance, **kwargs):
    refresh_product_rating(instance.product_id)
