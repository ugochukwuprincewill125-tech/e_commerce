from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.events import send_contact_notification

from .serializers import ContactMessageSerializer
from .store import COMPANY, NIGERIAN_STATES, shipping_settings


class StoreInfoView(APIView):
    """Public company information, locations, hours and shipping rules."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "company": COMPANY,
                "shipping": shipping_settings(),
                "states": NIGERIAN_STATES,
                "low_stock_threshold": settings.LOW_STOCK_THRESHOLD,
            }
        )


class ContactView(generics.CreateAPIView):
    serializer_class = ContactMessageSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "contact"

    def perform_create(self, serializer):
        # Saving the row is what populates the admin Messages tab. The email
        # notification is queued through the durable outbox so a temporary
        # provider outage cannot lose an enquiry.
        msg = serializer.save()
        send_contact_notification(msg)

    def create(self, request, *args, **kwargs):
        super().create(request, *args, **kwargs)
        return Response(
            {"detail": "Thanks for reaching out! Our team will get back to you shortly."},
            status=status.HTTP_201_CREATED,
        )


class HealthView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"status": "ok"})
