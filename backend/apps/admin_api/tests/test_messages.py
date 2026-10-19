"""Tests for the admin message inbox endpoints.

Contact-form enquiries pile up in the inbox. Staff resolve each one as it is
handled and can then delete it to keep the inbox manageable. The delete
button only exists on resolved messages, and the API refuses the operation
for anything still open — even when called directly — so an unhandled
enquiry can never quietly disappear.
"""
import pytest
from django.urls import reverse
from rest_framework import status

from apps.core.models import ContactMessage


def make_message(**overrides):
    data = {
        "name": "Test Customer",
        "email": "customer@example.com",
        "phone": "08000000000",
        "subject": "Broken charger",
        "message": "The charger I bought stopped working after a week.",
        "is_resolved": False,
    }
    data.update(overrides)
    return ContactMessage.objects.create(**data)


def detail_url(message):
    return reverse("admin-message-detail", args=[message.pk])


@pytest.mark.django_db
class TestAdminMessageDelete:
    def test_anonymous_cannot_delete(self, api_client):
        message = make_message(is_resolved=True)
        resp = api_client.delete(detail_url(message))
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert ContactMessage.objects.filter(pk=message.pk).exists()

    def test_customer_cannot_delete(self, auth_client):
        message = make_message(is_resolved=True)
        resp = auth_client.delete(detail_url(message))
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert ContactMessage.objects.filter(pk=message.pk).exists()

    def test_unresolved_message_is_not_deletable(self, staff_client):
        message = make_message(is_resolved=False)
        resp = staff_client.delete(detail_url(message))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "resolve" in resp.data["detail"].lower()
        message.refresh_from_db()
        assert message.is_resolved is False

    def test_resolved_message_is_deleted(self, staff_client):
        message = make_message(is_resolved=True)
        resp = staff_client.delete(detail_url(message))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not ContactMessage.objects.filter(pk=message.pk).exists()

    def test_resolving_then_deleting_works(self, staff_client):
        message = make_message(is_resolved=False)
        resp = staff_client.post(
            reverse("admin-message-resolve", args=[message.pk]), {"is_resolved": True}
        )
        assert resp.status_code == status.HTTP_200_OK
        resp = staff_client.delete(detail_url(message))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not ContactMessage.objects.filter(pk=message.pk).exists()

    def test_delete_only_removes_the_target(self, staff_client):
        keep = make_message(is_resolved=True, subject="Keep me")
        drop = make_message(is_resolved=True, subject="Drop me")
        resp = staff_client.delete(detail_url(drop))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert ContactMessage.objects.filter(pk=keep.pk).exists()
        assert not ContactMessage.objects.filter(pk=drop.pk).exists()
