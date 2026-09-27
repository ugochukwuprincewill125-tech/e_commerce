from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import cancel_order


class Command(BaseCommand):
    help = "Cancel unpaid orders older than UNPAID_ORDER_EXPIRY_HOURS and return their reserved stock. Run from cron."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=settings.UNPAID_ORDER_EXPIRY_HOURS)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=options["hours"])
        stale = Order.objects.filter(
            status=OrderStatus.PLACED,
            payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
            created_at__lt=cutoff,
        )
        count = stale.count()
        if options["dry_run"]:
            self.stdout.write(f"{count} unpaid order(s) would be cancelled.")
            return
        for order in stale:
            cancel_order(order, note="Automatically cancelled — payment not received in time.")
        self.stdout.write(self.style.SUCCESS(f"Cancelled {count} unpaid order(s) and released their stock."))
