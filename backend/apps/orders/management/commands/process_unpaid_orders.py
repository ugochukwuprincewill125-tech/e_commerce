from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import process_unpaid_order_followups


class Command(BaseCommand):
    help = (
        "Send payment reminders for abandoned orders and permanently delete unpaid orders "
        "whose grace period has elapsed. A scheduled GitHub workflow calls the equivalent "
        "maintenance endpoint in production; this command is for manual runs."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=200)
        parser.add_argument("--no-legacy", action="store_true", help="Do not cancel orders past UNPAID_ORDER_EXPIRY_HOURS.")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        now = timezone.now()
        if options["dry_run"]:
            reminder_cutoff = now - timedelta(minutes=settings.UNPAID_ORDER_REMINDER_MINUTES)
            deletion_cutoff = now - timedelta(minutes=settings.UNPAID_ORDER_DELETION_GRACE_MINUTES)
            due_reminders = Order.objects.filter(
                status=OrderStatus.PLACED,
                payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
                paid_at__isnull=True,
                payment_reminder_sent_at__isnull=True,
                created_at__lte=reminder_cutoff,
            ).count()
            due_deletions = Order.objects.filter(
                status=OrderStatus.PLACED,
                payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
                paid_at__isnull=True,
                payment_reminder_sent_at__lte=deletion_cutoff,
            ).count()
            self.stdout.write(
                f"{due_reminders} reminder(s) would be sent; {due_deletions} order(s) would be deleted."
            )
            return

        result = process_unpaid_order_followups(
            limit=options["limit"],
            now=now,
            cancel_stale_legacy=not options["no_legacy"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Reminders queued: {reminded}; orders deleted: {deleted}; "
                "deferred (payment pending/unverifiable): {deferred}; "
                "legacy orders cancelled: {cancelled_legacy}.".format(**result)
            )
        )
