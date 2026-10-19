from django.contrib import admin, messages
from django.utils.html import format_html

from .models import TransactionalEmail
from .services import resend_email

STATUS_COLOURS = {
    TransactionalEmail.Status.PENDING: "#b45309",
    TransactionalEmail.Status.SENDING: "#2563eb",
    TransactionalEmail.Status.SENT: "#047857",
    TransactionalEmail.Status.FAILED: "#b91c1c",
    TransactionalEmail.Status.SKIPPED: "#6b7280",
}


@admin.register(TransactionalEmail)
class TransactionalEmailAdmin(admin.ModelAdmin):
    list_display = ("template", "recipient", "subject_short", "status_pill", "test_mode", "attempts", "created_at", "sent_at")
    list_filter = ("status", "template", "test_mode", "provider", "created_at")
    search_fields = ("recipient_email", "effective_recipient", "subject", "provider_message_id", "idempotency_key")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    actions = ("retry_selected",)
    readonly_fields = (
        "idempotency_key", "template", "event", "recipient_email", "recipient_name", "effective_recipient",
        "subject", "status", "provider", "provider_message_id", "attempts", "is_retryable",
        "last_error", "test_mode", "created_at", "updated_at", "last_attempt_at", "sent_at", "next_retry_at",
        "metadata_display", "html_preview",
    )
    fieldsets = (
        ("Message", {"fields": ("template", "event", "subject", "recipient_email", "recipient_name", "effective_recipient", "test_mode", "idempotency_key")}),
        ("Delivery", {"fields": ("status", "provider", "provider_message_id", "attempts", "is_retryable", "last_error", "created_at", "updated_at", "last_attempt_at", "sent_at", "next_retry_at")}),
        ("Details", {"fields": ("metadata_display", "html_preview")}),
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Recipient", ordering="recipient_email")
    def recipient(self, obj):
        if obj.test_mode:
            return format_html("{}<br><small>test → {}</small>", obj.recipient_email, obj.effective_recipient or "console")
        return obj.recipient_email

    @admin.display(description="Subject")
    def subject_short(self, obj):
        return (obj.subject[:70] + "…") if len(obj.subject) > 70 else obj.subject

    @admin.display(description="Status", ordering="status")
    def status_pill(self, obj):
        colour = STATUS_COLOURS.get(obj.status, "#111")
        return format_html(
            '<span style="padding:2px 10px;border-radius:999px;color:#fff;background:{};font-weight:600;font-size:11px">{}</span>',
            colour,
            obj.get_status_display(),
        )

    @admin.display(description="Metadata")
    def metadata_display(self, obj):
        return format_html("<pre style='white-space:pre-wrap;margin:0'>{}</pre>", obj.metadata)

    @admin.display(description="HTML preview")
    def html_preview(self, obj):
        return format_html(
            "<details><summary>Show rendered HTML</summary><iframe sandbox style='width:100%;height:420px;border:1px solid #ddd;margin-top:8px' srcdoc=\"{}\"></iframe></details>",
            obj.html_body,
        )

    @admin.action(description="Retry selected email(s)")
    def retry_selected(self, request, queryset):
        sent = 0
        for email in queryset:
            record = resend_email(email.pk)
            if record and record.status == TransactionalEmail.Status.SENT:
                sent += 1
        self.message_user(request, f"{sent} email(s) delivered; the rest remain in the log for review.", messages.SUCCESS)
