"""Show the live email configuration and Brevo domain-authentication state.

This command is intentionally read-only. It never sends a message and never
prints an API key, SMTP password or rendered customer email.
"""
from datetime import timedelta
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.models import TransactionalEmail
from apps.notifications.providers import brevo_is_configured, choose_provider
from apps.notifications.services import mask_email


class Command(BaseCommand):
    help = "Check the email provider, sender domain authentication and outbox health."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-network",
            action="store_true",
            help="Skip the Brevo API lookup and only inspect local settings and the outbox.",
        )
        parser.add_argument(
            "--domain",
            default="",
            help="Domain to check in Brevo (defaults to the site host in FRONTEND_URL).",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Email configuration"))
        provider = choose_provider(test_mode=False, effective_recipient="check@example.com")
        self.stdout.write(f"  Provider:             {provider}")
        self.stdout.write(f"  Test mode:            {settings.EMAIL_TEST_MODE}")
        self.stdout.write(f"  Brevo API key set:    {bool(settings.BREVO_API_KEY)}")
        self.stdout.write(f"  Sender:               {settings.BREVO_SENDER_NAME} <{settings.BREVO_SENDER_EMAIL}>")
        self.stdout.write(f"  Reply-To:             {settings.BREVO_REPLY_TO_EMAIL or '(sender)'}")
        self.stdout.write(f"  Django backend:        {settings.EMAIL_BACKEND}")
        self.stdout.write(f"  FRONTEND_URL:         {settings.FRONTEND_URL}")

        if provider == "unconfigured":
            self.stdout.write(
                self.style.ERROR(
                    "  No real provider is configured for production. Set BREVO_API_KEY "
                    "or EMAIL_BACKEND/EMAIL_HOST_* to a working SMTP server."
                )
            )

        if not options["no_network"] and brevo_is_configured():
            domain = options["domain"].strip().lower()
            if not domain:
                domain = (urlparse(settings.FRONTEND_URL).hostname or "").lower()
            self._check_brevo_domain(domain)

        self._print_outbox_health()

    def _check_brevo_domain(self, domain):
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Brevo domain authentication"))
        sender_email = settings.BREVO_SENDER_EMAIL or ""
        if "@" not in sender_email:
            self.stdout.write(self.style.WARNING("  Sender is not a valid email address."))
            return
        sender_domain = sender_email.rsplit("@", 1)[1].lower()
        if sender_domain != domain:
            self.stdout.write(
                self.style.WARNING(
                    f"  The sender uses {sender_domain}, not the site domain {domain}. "
                    "Brevo rewrites consumer-mailbox senders to a shared brevosend.com "
                    "address, which can hurt inbox placement."
                )
            )
        if not domain:
            self.stdout.write(self.style.WARNING("  No domain to check; pass --domain."))
            return
        headers = {"api-key": settings.BREVO_API_KEY, "accept": "application/json"}
        base = settings.BREVO_API_URL

        try:
            response = requests.get(
                f"{base}/senders/domains/{domain}",
                headers=headers,
                timeout=settings.BREVO_API_TIMEOUT,
            )
        except requests.RequestException as exc:
            self.stdout.write(
                self.style.WARNING(f"  Could not reach Brevo ({type(exc).__name__}); try again later.")
            )
            return

        if response.status_code == 404:
            self.stdout.write(
                self.style.WARNING(
                    f"  {domain} is not added in Brevo. Add it under Senders, Domains "
                    "& Dedicated IPs -> Domains."
                )
            )
            return
        if response.status_code != 200:
            self.stdout.write(self.style.WARNING(f"  Brevo returned HTTP {response.status_code}."))
            return

        try:
            payload = response.json()
        except ValueError:
            self.stdout.write(self.style.WARNING("  Brevo returned an unreadable response."))
            return

        authenticated = bool(payload.get("authenticated"))
        verified = bool(payload.get("verified"))
        self.stdout.write(f"  Domain:               {domain}")
        self.stdout.write(f"  Verified:             {'yes' if verified else 'no'}")
        self.stdout.write(f"  Authenticated:        {'yes' if authenticated else 'no'}")

        if authenticated:
            self.stdout.write(
                self.style.SUCCESS(
                    "  The sender domain is authenticated. Use an address at this domain "
                    "for the best inbox placement."
                )
            )
            return

        records = payload.get("dns_records") or {}
        pending = [record for record in records.values() if isinstance(record, dict) and not record.get("status")]
        if not pending:
            self.stdout.write(
                self.style.WARNING(
                    "  Brevo has no pending DNS records to show. Open Brevo Domains and "
                    "click Authenticate to re-check."
                )
            )
            return

        self.stdout.write("")
        self.stdout.write("  Add these DNS records, then authenticate the domain in Brevo:")
        for record in pending:
            self.stdout.write(
                f"    {record.get('type', '?')}  {record.get('host_name', '?')}  "
                f"{record.get('value', '?')}"
            )
        self.stdout.write("")
        self.stdout.write("  Recommended SPF record if the domain has none:")
        self.stdout.write("    TXT  @  v=spf1 include:spf.brevo.com ~all")
        self.stdout.write(
            "  Tip: keep SPF/DMARC values as one TXT record each if your DNS provider "
            "rejects duplicates."
        )

    def _print_outbox_health(self):
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Outbox"))
        now = timezone.now()
        last_day = now - timedelta(days=1)
        total = TransactionalEmail.objects.count()
        sent_24h = TransactionalEmail.objects.filter(
            status=TransactionalEmail.Status.SENT, sent_at__gte=last_day
        ).count()
        pending = TransactionalEmail.objects.filter(
            status__in=(TransactionalEmail.Status.PENDING, TransactionalEmail.Status.SENDING)
        ).count()
        failed = TransactionalEmail.objects.filter(status=TransactionalEmail.Status.FAILED).count()
        self.stdout.write(f"  Total stored:         {total}")
        self.stdout.write(f"  Sent in last 24h:     {sent_24h}")
        self.stdout.write(f"  Pending/in-flight:    {pending}")
        self.stdout.write(f"  Failed:               {failed}")

        problems = TransactionalEmail.objects.filter(
            status__in=(TransactionalEmail.Status.PENDING, TransactionalEmail.Status.FAILED)
        ).order_by("-created_at")[:5]
        if problems:
            self.stdout.write("")
            self.stdout.write("  Most recent unresolved messages:")
            for record in problems:
                error = (record.last_error or "").replace("\n", " ")[:160]
                self.stdout.write(
                    f"    {record.pk}  {record.template:<20}  {mask_email(record.recipient_email):<32}  "
                    f"{record.get_status_display():<10}  {error}"
                )
