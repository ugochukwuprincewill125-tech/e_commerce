"""One account per email address — enforced at every layer.

The rule has to hold no matter how the row is written, so it is checked in
three places:

* the serializer, which answers a customer with a friendly message instead of
  a database error;
* the manager, which refuses to build a second account for the same address;
* the database itself, which rejects the row even when something bypasses
  both of the above (the Django admin, a shell, raw SQL).

Addresses are compared case-insensitively and with surrounding whitespace
ignored, because "Ada@Example.com " and "ada@example.com" are the same
person's mailbox.
"""
import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import DUPLICATE_EMAIL_ERROR, DuplicateEmailError

User = get_user_model()

REGISTER_URL = "/api/auth/register/"
PROFILE_URL = "/api/users/profile/"
PASSWORD = "StrongPass123!"


def payload(**overrides):
    data = {
        "first_name": "Ada",
        "last_name": "Okafor",
        "email": "ada.okafor@example.com",
        "phone": "08031234567",
        "password": PASSWORD,
        "confirm_password": PASSWORD,
    }
    data.update(overrides)
    return data


@pytest.fixture
def existing_user():
    return User.objects.create_user(
        email="ada.okafor@example.com",
        first_name="Ada",
        last_name="Okafor",
        password=PASSWORD,
        phone="08031234567",
        email_verified=True,
    )


@pytest.fixture
def auth_client():
    return APIClient()


def authenticate(client, user):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


@pytest.mark.django_db
class TestRegistrationRejectsADuplicateAddress:
    @pytest.mark.parametrize(
        "email",
        [
            "ada.okafor@example.com",
            "ADA.OKAFOR@EXAMPLE.COM",
            "Ada.Okafor@Example.Com",
            "  ada.okafor@example.com  ",
            "\tada.okafor@example.com\n",
        ],
        ids=["exact", "upper", "mixed-case", "padded", "tabbed"],
    )
    def test_a_taken_address_is_refused(self, auth_client, existing_user, email):
        resp = auth_client.post(REGISTER_URL, payload(email=email), format="json")

        assert resp.status_code == status.HTTP_400_BAD_REQUEST, resp.data
        assert "email" in resp.data["errors"], resp.data
        assert User.objects.filter(email__iexact="ada.okafor@example.com").count() == 1

    def test_the_customer_is_told_to_use_another_address(self, auth_client, existing_user):
        resp = auth_client.post(REGISTER_URL, payload(), format="json")

        message = " ".join(resp.data["errors"]["email"])
        assert "already exists" in message.lower()
        assert "different email" in message.lower()

    def test_the_address_is_stored_in_its_canonical_form(self, auth_client):
        resp = auth_client.post(
            REGISTER_URL, payload(email="  Ada.Okafor@Example.COM  "), format="json"
        )

        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        user = User.objects.get(email="ada.okafor@example.com")
        assert user.email == "ada.okafor@example.com"

    def test_two_different_addresses_still_both_register(self, auth_client):
        first = auth_client.post(REGISTER_URL, payload(), format="json")
        second = auth_client.post(
            REGISTER_URL, payload(email="grace.okafor@example.com"), format="json"
        )

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_201_CREATED
        assert User.objects.count() == 2

    def test_a_rejected_registration_leaves_no_orphan_row(self, auth_client, existing_user):
        auth_client.post(REGISTER_URL, payload(email="ADA.OKAFOR@EXAMPLE.COM"), format="json")

        assert User.objects.count() == 1


@pytest.mark.django_db
class TestTheManagerRefusesDuplicates:
    def test_creating_a_second_account_for_the_same_address_fails(self, existing_user):
        with pytest.raises(DuplicateEmailError) as excinfo:
            User.objects.create_user(
                email="ADA.OKAFOR@example.com",
                first_name="Ada",
                last_name="Okafor",
                password=PASSWORD,
            )

        assert "different email" in str(excinfo.value).lower()
        assert User.objects.filter(email__iexact="ada.okafor@example.com").count() == 1

    def test_the_manager_normalises_the_address(self):
        user = User.objects.create_user(
            email="  Grace.Okafor@Example.COM  ",
            first_name="Grace",
            last_name="Okafor",
            password=PASSWORD,
        )

        assert user.email == "grace.okafor@example.com"


@pytest.mark.django_db
class TestTheDatabaseRefusesDuplicates:
    def test_a_case_variant_row_is_rejected_by_the_database(self, existing_user):
        second = User.objects.create(
            email="second@example.com",
            first_name="Second",
            last_name="User",
        )
        # A raw write keeps the mixed-case spelling, which the column's own
        # unique=True accepts — only the lower-case index refuses it.
        with pytest.raises(IntegrityError) as excinfo:
            with transaction.atomic():
                User.objects.filter(pk=second.pk).update(email="ADA.OKAFOR@EXAMPLE.COM")

        assert "users_user_email_lower_unique" in str(excinfo.value)

    def test_saving_a_user_normalises_the_address(self, existing_user):
        existing_user.email = "  Ada.Okafor@Example.COM  "
        existing_user.save()

        existing_user.refresh_from_db()
        assert existing_user.email == "ada.okafor@example.com"

    def test_saving_with_update_fields_keeps_the_normalised_address(self, existing_user):
        existing_user.email = "ADA.OKAFOR@EXAMPLE.COM"
        existing_user.save(update_fields=["email"])

        existing_user.refresh_from_db()
        assert existing_user.email == "ada.okafor@example.com"


@pytest.mark.django_db
class TestProfileUpdateChecksUniqueness:
    def test_taking_another_customers_address_is_refused(self, auth_client, existing_user):
        other = User.objects.create_user(
            email="grace.okafor@example.com",
            first_name="Grace",
            last_name="Okafor",
            password=PASSWORD,
        )
        client = authenticate(auth_client, existing_user)

        resp = client.patch(
            PROFILE_URL, {"email": "GRACE.OKAFOR@example.com"}, format="json"
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST, resp.data
        assert "email" in resp.data["errors"], resp.data
        other.refresh_from_db()
        assert other.email == "grace.okafor@example.com"

    def test_a_customer_may_rewrite_their_own_address(self, auth_client, existing_user):
        client = authenticate(auth_client, existing_user)

        resp = client.patch(PROFILE_URL, {"email": "ada.new@example.com"}, format="json")

        assert resp.status_code == status.HTTP_200_OK, resp.data
        existing_user.refresh_from_db()
        assert existing_user.email == "ada.new@example.com"
        # Changing the address invalidates the old verification.
        assert existing_user.email_verified is False

    def test_keeping_the_same_address_is_allowed(self, auth_client, existing_user):
        client = authenticate(auth_client, existing_user)

        resp = client.patch(PROFILE_URL, {"email": "ADA.OKAFOR@EXAMPLE.COM"}, format="json")

        assert resp.status_code == status.HTTP_200_OK, resp.data
        existing_user.refresh_from_db()
        assert existing_user.email == "ada.okafor@example.com"


def test_the_duplicate_message_names_the_problem():
    assert "already exists" in DUPLICATE_EMAIL_ERROR.lower()
    assert "different email" in DUPLICATE_EMAIL_ERROR.lower()
