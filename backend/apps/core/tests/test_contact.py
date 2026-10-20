"""Contact form: store in the admin inbox and email the team copy."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.models import ContactMessage
from apps.notifications.models import TransactionalEmail

User = get_user_model()

CONTACT = "/api/contact/"
ADMIN_MESSAGES = "/api/admin-api/messages/"


@pytest.mark.django_db
class TestContactMessage:
    def test_message_is_stored_and_emailed_to_the_team_inbox(self, api_client, settings):
        settings.CONTACT_NOTIFICATION_EMAIL = "timelinegadgets4@gmail.com"

        resp = api_client.post(
            CONTACT,
            {
                "name": "Ada Okafor",
                "email": "ada@example.com",
                "phone": "08031234567",
                "subject": "Question about a laptop",
                "message": "Do you have this model in stock? I would like to order one.",
            },
            format="json",
        )

        assert resp.status_code == 201
        message = ContactMessage.objects.get(email="ada@example.com")
        record = TransactionalEmail.objects.get(template="contact_message")
        assert record.recipient_email == "timelinegadgets4@gmail.com"
        assert record.metadata["contact_message_id"] == message.pk
        assert "Question about a laptop" in record.html_body
        assert "ada@example.com" in record.text_body

    def test_stored_message_is_visible_in_the_admin_inbox(self, api_client, settings):
        settings.CONTACT_NOTIFICATION_EMAIL = "timelinegadgets4@gmail.com"
        api_client.post(
            CONTACT,
            {
                "name": "Ada Okafor",
                "email": "ada@example.com",
                "subject": "Bulk order",
                "message": "I would like a quote for ten units, please.",
            },
            format="json",
        )

        staff = User.objects.create_user(
            email="staff@example.com",
            first_name="Store",
            last_name="Staff",
            password="StaffPass123!",
            is_staff=True,
        )
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(staff)}")
        resp = api_client.get(ADMIN_MESSAGES, {"is_resolved": "false"})

        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["subject"] == "Bulk order"
