"""Render HTML, plain-text and subject for each transactional template."""
from django.template import Context, Engine
from django.template.loader import render_to_string

from apps.core.store import COMPANY

TEMPLATE_SPECS = {
    "welcome": {
        "html": "emails/welcome.html",
        "text": "emails/welcome.txt",
        "subject": (
            "{% if verify_url %}Welcome to {{ store_name }} — verify your email"
            "{% else %}Welcome to {{ store_name }}{% endif %}"
        ),
    },
    "verify_email": {
        "html": "emails/verify_email.html",
        "text": "emails/verify_email.txt",
        "subject": "Verify your {{ store_name }} email address",
    },
    "password_reset": {
        "html": "emails/password_reset.html",
        "text": "emails/password_reset.txt",
        "subject": "Reset your {{ store_name }} password",
    },
    "contact_message": {
        "html": "emails/contact_message.html",
        "text": "emails/contact_message.txt",
        "subject": "New website message: {{ subject }}",
    },
    "order_confirmation": {
        "html": "emails/order_confirmation.html",
        "text": "emails/order_confirmation.txt",
        "subject": "Order {{ order_number }} received — {{ store_name }}",
    },
    "payment_confirmation": {
        "html": "emails/payment_confirmation.html",
        "text": "emails/payment_confirmation.txt",
        "subject": "Payment confirmed for order {{ order_number }}",
    },
    "payment_reminder": {
        "html": "emails/payment_reminder.html",
        "text": "emails/payment_reminder.txt",
        "subject": "Payment still pending for order {{ order_number }}",
    },
    "order_auto_deleted": {
        "html": "emails/order_auto_deleted.html",
        "text": "emails/order_auto_deleted.txt",
        "subject": "Order {{ order_number }} has been deleted",
    },
    "order_paid_admin": {
        "html": "emails/order_paid_admin.html",
        "text": "emails/order_paid_admin.txt",
        "subject": "Payment received for order {{ order_number }} — {{ total }}",
    },
    "order_processing": {
        "html": "emails/order_processing.html",
        "text": "emails/order_processing.txt",
        "subject": "Order {{ order_number }} is being prepared",
    },
    "order_ready": {
        "html": "emails/order_ready.html",
        "text": "emails/order_ready.txt",
        "subject": (
            "{% if is_pickup %}Your order {{ order_number }} is ready for pickup"
            "{% else %}Your order {{ order_number }} is ready for delivery{% endif %}"
        ),
    },
    "order_shipped": {
        "html": "emails/order_shipped.html",
        "text": "emails/order_shipped.txt",
        "subject": "Your order {{ order_number }} is on its way",
    },
    "order_delivered": {
        "html": "emails/order_delivered.html",
        "text": "emails/order_delivered.txt",
        "subject": "Order {{ order_number }} {{ delivery_verb }}",
    },
    "order_cancelled": {
        "html": "emails/order_cancelled.html",
        "text": "emails/order_cancelled.txt",
        "subject": "Order {{ order_number }} has been cancelled",
    },
    "order_refunded": {
        "html": "emails/order_refunded.html",
        "text": "emails/order_refunded.txt",
        "subject": "Refund update for order {{ order_number }}",
    },
    "system_test": {
        "html": "emails/system_test.html",
        "text": "emails/system_test.txt",
        "subject": "{{ store_name }} transactional email test",
    },
}


def _base_context(context):
    store_name = COMPANY.get("short_name") or COMPANY.get("name") or "Timeline Gadgets"
    data = {
        "store": COMPANY,
        "store_name": store_name,
        "store_legal_name": COMPANY.get("name", store_name),
        "store_email": COMPANY.get("email", ""),
        "store_tagline": COMPANY.get("tagline", ""),
        "support_email": COMPANY.get("email", ""),
        "site_url": context.get("site_url", ""),
        "year": context.get("year", ""),
        "preheader": context.get("preheader", ""),
        "test_mode": bool(context.get("test_mode")),
        "intended_recipient": context.get("intended_recipient", ""),
    }
    data.update(context)
    return data


def _render_subject(template_string, context):
    return Engine.get_default().from_string(template_string).render(Context(context, autoescape=False)).strip()


def render_email(template, context):
    """Return ``(subject, html, text)`` for a template slug and context."""
    try:
        spec = TEMPLATE_SPECS[template]
    except KeyError as exc:
        raise ValueError(f"Unknown transactional email template: {template}") from exc

    data = _base_context(context)
    html = render_to_string(spec["html"], data)
    text = render_to_string(spec["text"], data)
    subject = _render_subject(spec["subject"], data)
    return subject, html, text
