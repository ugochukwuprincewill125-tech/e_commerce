"""Retry pending/failed transactional emails whose next attempt is due."""
from django.core.management.base import BaseCommand

from apps.notifications.services import retry_due_emails


class Command(BaseCommand):
    help = "Retry transactional emails that are pending or failed with a retryable error."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50, help="Maximum messages to process (default 50).")
        parser.add_argument("--dry-run", action="store_true", help="List what would be retried without sending.")

    def handle(self, *args, **options):
        limit = max(1, options["limit"])
        if options["dry_run"]:
            from django.utils import timezone
            from django.db.models import Q
            from datetime import timedelta
            from django.conf import settings
            from apps.notifications.models import TransactionalEmail

            now = timezone.now()
            due = (
                TransactionalEmail.objects.filter(attempts__lt=settings.EMAIL_MAX_ATTEMPTS)
                .filter(
                    Q(status=TransactionalEmail.Status.PENDING)
                    | Q(status=TransactionalEmail.Status.FAILED, is_retryable=True)
                    | Q(status=TransactionalEmail.Status.SENDING,
                        last_attempt_at__lt=now - timedelta(minutes=5))
                )
                .filter(Q(next_retry_at__isnull=True) | Q(next_retry_at__lte=now))
                .order_by("created_at")[:limit]
            )
            for record in due:
                self.stdout.write(
                    f"{record.pk}: {record.template} → {record.recipient_email} "
                    f"[{record.status}, attempts={record.attempts}]"
                )
            self.stdout.write(f"{len(due)} message(s) due for retry.")
            return

        result = retry_due_emails(limit=limit)
        self.stdout.write(
            self.style.SUCCESS(
                f"Checked {result['checked']} message(s): {result['sent']} sent, "
                f"{result['still_pending']} still pending."
            )
        )
