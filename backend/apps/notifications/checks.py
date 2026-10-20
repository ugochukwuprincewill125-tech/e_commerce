"""Deployment checks for the transactional-email configuration.

``python manage.py check`` reports these, so a build step (or a manual run
while deploying) surfaces the two mistakes that silently stop customer email:

* no real provider configured — messages would only be printed to the log
  and the customer would receive nothing;
* a free-mailbox sender (gmail.com and friends) — the provider rewrites it
  and Gmail rejects the message instead of delivering it.

Both are warnings rather than errors so a deployment is never blocked by a
configuration detail; the health endpoint reports the same state at runtime.
"""
from django.conf import settings
from django.core.checks import Warning as CheckWarning
from django.core.checks import register

from .providers import choose_provider, deliverability_warning


@register()
def check_email_delivery(app_configs, **kwargs):
    issues = []

    if settings.DEBUG:
        # Development is deliberately capture-only unless the developer opts
        # out, so the checks would only be noise there.
        return issues

    provider = choose_provider(
        test_mode=bool(settings.EMAIL_TEST_MODE),
        effective_recipient=(settings.EMAIL_TEST_RECIPIENT or "").strip(),
    )
    if provider == "unconfigured":
        issues.append(
            CheckWarning(
                "No production email provider is configured: set BREVO_API_KEY and "
                "BREVO_SENDER_EMAIL, or point EMAIL_BACKEND at a real SMTP server. "
                "Customer email is not delivered until this is fixed.",
                id="notifications.W001",
            )
        )
    elif provider == "console":
        issues.append(
            CheckWarning(
                "Transactional email is capture-only (EMAIL_TEST_MODE is on and no "
                "EMAIL_TEST_RECIPIENT is set), so no customer receives any message.",
                id="notifications.W002",
            )
        )

    warning = deliverability_warning()
    if warning:
        issues.append(CheckWarning(warning, id="notifications.W003"))

    return issues
