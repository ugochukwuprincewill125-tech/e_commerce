from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    label = "notifications"
    verbose_name = "Transactional email"

    def ready(self):
        # Registers the deployment checks for the email configuration.
        from . import checks  # noqa: F401
