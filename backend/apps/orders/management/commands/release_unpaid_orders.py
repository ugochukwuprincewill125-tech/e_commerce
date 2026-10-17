from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import release_stale_unpaid_orders


class Command(BaseCommand):
    help = (
        "Cancel unpaid orders older than UNPAID_ORDER_EXPIRY_HOURS and return their reserved stock. "
        "Production runs this automatically via the maintenance workflow; the command stays for manual use."
    )

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=settings.UNPAID_ORDER_EXPIRY_HOURS)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if options["dry_run"]:
            cutoff = timezone.now() - timedelta(hours=options["hours"])
            count = Order.objects.filter(
                status=OrderStatus.PLACED,
                payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
                created_at__lt=cutoff,
            ).count()
            self.stdout.write(f"{count} unpaid order(s) would be cancelled.")
            return
        count = release_stale_unpaid_orders(options["hours"])
        self.stdout.write(self.style.SUCCESS(f"Cancelled {count} unpaid order(s) and released their stock."))
