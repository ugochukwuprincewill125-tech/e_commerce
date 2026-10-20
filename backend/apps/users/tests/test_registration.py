"""Registration rules — every field on the form is mandatory.

The form labels first/last name, email, phone, password and confirm password
as required. The backend enforces the same contract so the API cannot be used
to create an account that skips a field the UI insists on. Phone is the one
field whose model column allows blank (staff-created accounts and older rows
predate this rule), so the requirement lives in the serializer.

Field errors are returned under ``errors`` by the project exception handler,
alongside a human-readable ``detail``.
"""
import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.exceptions import ValidationError

User = get_user_model()

VALID = {
    "first_name": "Ada",
    "last_name": "Okafor",
    "email": "ada.okafor@example.com",
    "phone": "08031234567",
    "password": "StrongPass123!",
    "confirm_password": "StrongPass123!",
}


def field_errors(resp):
    return (resp.data or {}).get("errors", {})


@pytest.fixture
def register_url():
    return reverse("auth-register")


@pytest.mark.django_db
class TestRegistrationRequiredFields:
    def test_valid_registration_creates_the_account(self, api_client, register_url):
        resp = api_client.post(register_url, VALID, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        user = User.objects.get(email=VALID["email"])
        assert user.phone == VALID["phone"]

    @pytest.mark.parametrize(
        "field",
        ["first_name", "last_name", "email", "phone", "password", "confirm_password"],
    )
    def test_every_field_is_required(self, api_client, register_url, field):
        payload = {**VALID}
        payload.pop(field)
        resp = api_client.post(register_url, payload, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert field in field_errors(resp), resp.data
        assert not User.objects.filter(email=VALID["email"]).exists()

    def test_phone_cannot_be_blank(self, api_client, register_url):
        resp = api_client.post(register_url, {**VALID, "phone": ""}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "phone" in field_errors(resp)
        assert not User.objects.filter(email=VALID["email"]).exists()

    def test_phone_cannot_be_whitespace_only(self, api_client, register_url):
        resp = api_client.post(register_url, {**VALID, "phone": "   "}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "phone" in field_errors(resp)
        assert not User.objects.filter(email=VALID["email"]).exists()

    @pytest.mark.parametrize("phone", ["abc", "12", "+234-706-289-5442!", "phone please"])
    def test_invalid_phone_is_rejected(self, api_client, register_url, phone):
        resp = api_client.post(register_url, {**VALID, "phone": phone}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "phone" in field_errors(resp)

    @pytest.mark.parametrize(
        "phone,email",
        [
            ("08031234567", "ng-local@example.com"),
            ("+234 706 289 5442", "ng-intl@example.com"),
            ("(080) 312-3456", "ng-brackets@example.com"),
        ],
    )
    def test_common_phone_formats_are_accepted(self, api_client, register_url, phone, email):
        resp = api_client.post(register_url, {**VALID, "phone": phone, "email": email}, format="json")
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        assert User.objects.get(email=email).phone == phone


@pytest.mark.django_db
class TestDuplicateEmail:
    @pytest.fixture
    def existing_user(self):
        return User.objects.create_user(
            email=VALID["email"],
            first_name=VALID["first_name"],
            last_name=VALID["last_name"],
            password=VALID["password"],
            phone=VALID["phone"],
        )

    def test_exact_duplicate_email_is_rejected(self, api_client, register_url, existing_user):
        resp = api_client.post(register_url, VALID, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in field_errors(resp), resp.data
        assert User.objects.filter(email__iexact=VALID["email"]).count() == 1

    def test_case_insensitive_duplicate_email_is_rejected(self, api_client, register_url, existing_user):
        payload = {**VALID, "email": VALID["email"].upper()}
        resp = api_client.post(register_url, payload, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in field_errors(resp), resp.data

    def test_duplicate_email_error_mentions_using_a_different_email(self, api_client, register_url, existing_user):
        resp = api_client.post(register_url, VALID, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        errors = field_errors(resp)
        message = " ".join(errors["email"])
        assert "different email" in message.lower()

    def test_create_user_raises_validation_error_on_integrity_error(self, existing_user):
        from apps.users.serializers import RegisterSerializer

        serializer = RegisterSerializer()
        validated = {
            "email": existing_user.email,
            "first_name": "Ada",
            "last_name": "Okafor",
            "phone": "08031234567",
            "password": "StrongPass123!",
        }
        with pytest.raises(ValidationError, match="already exists"):
            serializer.create(validated)
