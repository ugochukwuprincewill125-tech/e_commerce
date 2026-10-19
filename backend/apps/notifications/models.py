"""Durable outbox for transactional email.

Every message is stored before delivery with a unique idempotency key. That
gives the application three important properties:

* a repeated payment webhook or order event cannot send the same email twice;
* a failed Brevo call is visible and can be retried later;
* development can inspect exactly what would have been sent.
"""
from django.db import models


class TransactionalEmail(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    # The event's stable identity, e.g. "payment-confirmation:42:REF-123".
    # The database enforces uniqueness, so concurrent webhooks/requests cannot
    # both create the same message.
    idempotency_key = models.CharField(max_length=255, unique=True)
    template = models.CharField(max_length=80, db_index=True)
    event = models.CharField(max_length=80, blank=True, db_index=True)

    recipient_email = models.EmailField(help_text="The customer address this message was intended for.")
    recipient_name = models.CharField(max_length=120, blank=True)
    effective_recipient = models.EmailField(
        blank=True,
        help_text="Where the message is actually delivered (differs in test mode).",
    )

    subject = models.CharField(max_length=255)
    html_body = models.TextField()
    text_body = models.TextField()

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    provider = models.CharField(max_length=30, blank=True)
    provider_message_id = models.CharField(max_length=255, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    is_retryable = models.BooleanField(default=True)
    last_error = models.TextField(blank=True)
    test_mode = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["status", "next_retry_at"]),
        ]
        verbose_name = "transactional email"
        verbose_name_plural = "transactional emails"

    def __str__(self):
        return f"{self.template} → {self.recipient_email} ({self.get_status_display()})"
