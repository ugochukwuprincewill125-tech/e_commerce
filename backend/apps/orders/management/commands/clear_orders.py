"""Clear all orders and restore reserved stock.

Useful for wiping test-mode order data before switching Paystack from test to
live mode so the admin and customer dashboards start clean. Related rows
(OrderItem, OrderStatusHistory, Payment) are removed via cascade, and any
reserved stock that was never released is returned to inventory first.

Usage:
    python manage.py clear_orders --dry-run   # preview
    python manage.py clear_orders             # actually delete
"""

from django.core.management.base import BaseCommand, CommandError

from apps.orders.models import Order
from apps.orders.services import restore_stock


class Command(BaseCommand):
    help = "Delete every order (and cascade), restoring any reserved stock first."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without making any changes.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip the interactive confirmation prompt.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        order_count = Order.objects.count()
        unpaid_order_count = Order.objects.filter(stock_restored=False).count()

        self.stdout.write(f"Orders in database:        {order_count}")
        self.stdout.write(f"With stock not restored:   {unpaid_order_count}")

        if order_count == 0:
            self.stdout.write("Nothing to clear.")
            return

        if dry_run:
            self.stdout.write("DRY RUN — no changes made.")
            return

        if not options["yes"]:
            confirm = input("Type YES to confirm deletion of ALL orders: ")
            if confirm.strip() != "YES":
                raise CommandError("Aborted.")

        restored = 0
        for order in Order.objects.filter(stock_restored=False):
            restore_stock(order)
            restored += 1

        Order.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {order_count} order(s); restored stock for {restored} order(s)."
            )
        )
