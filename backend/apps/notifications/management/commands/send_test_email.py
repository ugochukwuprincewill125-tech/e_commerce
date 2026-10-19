"""Send one diagnostic email through the configured transactional path."""
from django.core.management.base import BaseCommand, CommandError

from apps.notifications.events import send_test_email


class Command(BaseCommand):
    help = "Send a test transactional email to a single address."

    def add_arguments(self, parser):
        parser.add_argument("to", help="Recipient address for the test message.")
        parser.add_argument("--name", default="", help="Optional display name for the recipient.")

    def handle(self, *args, **options):
        record = send_test_email(options["to"], options.get("name", ""))
        if record is None:
            raise CommandError("The test email could not be queued. Check the server logs for details.")
        record.refresh_from_db()
        self.stdout.write(
            self.style.SUCCESS(
                f"Test email {record.pk} is {record.get_status_display().lower()} "
                f"via {record.provider or 'pending provider'}. "
                f"Intended recipient: {record.recipient_email}; delivered to: {record.effective_recipient or 'console'}."
            )
        )
        if record.last_error:
            self.stdout.write(self.style.WARNING(f"Last error: {record.last_error}"))
