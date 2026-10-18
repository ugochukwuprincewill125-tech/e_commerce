from django.conf import settings
from django.core.management.base import BaseCommand

from apps.payments.services import open_payments, verify_payment_with_provider


class Command(BaseCommand):
    help = (
        "Re-verify recent open Paystack payments and reconcile late outcomes — a checkout that "
        "settled after the customer cancelled it, or a payment whose webhook never arrived. "
        "Nothing is charged or refunded by this command; it only reads Paystack and updates our books."
    )

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=48, help="How far back to re-check (default 48).")
        parser.add_argument("--order", default="", help="Only this order number.")
        parser.add_argument("--limit", type=int, default=200, help="Maximum payments to check (default 200).")
        parser.add_argument("--dry-run", action="store_true", help="List what would be checked; touch nothing.")

    def handle(self, *args, **options):
        payments = open_payments(
            hours=options["hours"],
            order_number=options["order"],
            limit=max(options["limit"], 1),
        )
        if not payments:
            self.stdout.write("No open Paystack payments in this window — nothing to reconcile.")
            return

        if options["dry_run"]:
            for payment in payments:
                self.stdout.write(
                    f"would check {payment.reference} "
                    f"(order {payment.order.order_number}, status {payment.status})"
                )
            self.stdout.write(f"{len(payments)} payment(s) would be checked.")
            return

        if not settings.PAYSTACK_SECRET_KEY:
            self.stderr.write(self.style.ERROR("PAYSTACK_SECRET_KEY is not configured — cannot verify."))
            return

        counts = {"success": 0, "failed": 0, "abandoned": 0, "pending": 0, "not_found": 0, "error": 0}
        for payment in payments:
            outcome = verify_payment_with_provider(payment)
            counts[outcome] += 1
            if outcome == "success":
                self.stdout.write(self.style.SUCCESS(
                    f"[success] {payment.reference} — order {payment.order.order_number} is now PAID."
                ))
            elif outcome == "error":
                # A single unreadable reference shouldn't abort the sweep, but
                # a dead provider shouldn't stack timeouts either — bail out
                # after repeated failures.
                if counts["error"] >= 3:
                    self.stderr.write(self.style.WARNING(
                        "Paystack looks unreachable — stopping. Run the command again later."
                    ))
                    break
                self.stdout.write(self.style.WARNING(
                    f"[error]   {payment.reference} — could not reach Paystack, left unchanged."
                ))
            else:
                self.stdout.write(f"[{outcome}] {payment.reference} — order {payment.order.order_number} unchanged.")

        summary = ", ".join(f"{name}={count}" for name, count in counts.items() if count)
        self.stdout.write(f"Checked {sum(counts.values())} payment(s): {summary}")
