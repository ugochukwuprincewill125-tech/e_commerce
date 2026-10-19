import hmac

from django.conf import settings
from django.urls import path
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import retry_due_emails


class RetryEmailsView(APIView):
    """POST /api/emails/maintenance/retry/ — token-guarded email retry sweep.

    Called by the scheduled maintenance workflow next to the payment/order
    upkeep. Disabled (404) until MAINTENANCE_TOKEN is configured.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def post(self, request):
        token = settings.MAINTENANCE_TOKEN
        supplied = request.META.get("HTTP_X_MAINTENANCE_TOKEN", "")
        if not token or not hmac.compare_digest(token, supplied):
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            limit = min(max(int(request.data.get("limit", 25)), 1), 100)
        except (TypeError, ValueError):
            limit = 25
        return Response(retry_due_emails(limit=limit), status=status.HTTP_200_OK)


urlpatterns = [
    path("maintenance/retry/", RetryEmailsView.as_view(), name="email-maintenance-retry"),
]
