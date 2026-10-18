"""Role management on the customers screen: customers < admins < superusers.

Any panel user — admin or superuser — can promote a customer, revoke another
admin, or block/unblock a customer or fellow admin. Two accounts are out of
bounds for everyone: a superuser's (never modifiable from the API) and one's
own (no self-lockout).
"""
import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

pytestmark = pytest.mark.django_db


def client_for(user):
    """An API client authenticated as `user`."""
    from rest_framework_simplejwt.tokens import AccessToken

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


@pytest.fixture
def admin_user(db):
    """A plain admin — `is_staff` without superuser, as `set_staff` grants."""
    return User.objects.create_user(
        email="plain-admin@example.com",
        first_name="Plain",
        last_name="Admin",
        password="TestPass123!",
        is_staff=True,
    )


@pytest.fixture
def second_admin(db):
    """A second plain admin, to test admin-on-admin restrictions."""
    return User.objects.create_user(
        email="second-admin@example.com",
        first_name="Second",
        last_name="Admin",
        password="TestPass123!",
        is_staff=True,
    )


@pytest.fixture
def second_superuser(db):
    """A fellow superuser — protected from the API, exactly like the owner."""
    return User.objects.create_superuser(
        email="co-owner@example.com",
        first_name="Co",
        last_name="Owner",
        password="TestPass123!",
    )


class TestAdminGate:
    def test_admin_can_use_the_admin_api(self, admin_user):
        resp = client_for(admin_user).get(reverse("admin-customer-list"))
        assert resp.status_code == status.HTTP_200_OK

    def test_customers_cannot_use_the_admin_api(self, auth_client):
        assert auth_client.get(reverse("admin-customer-list")).status_code == status.HTTP_403_FORBIDDEN


class TestSetStaff:
    def test_promoting_grants_admin_not_superuser(self, staff_client, customer):
        resp = staff_client.post(
            reverse("admin-customer-set-staff", args=[customer.pk]), {"is_staff": True}, format="json"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["is_staff"] is True
        customer.refresh_from_db()
        assert customer.is_staff is True
        assert customer.is_superuser is False

    def test_demoting_revokes_admin(self, staff_client, admin_user):
        resp = staff_client.post(
            reverse("admin-customer-set-staff", args=[admin_user.pk]), {"is_staff": False}, format="json"
        )
        assert resp.status_code == status.HTTP_200_OK
        admin_user.refresh_from_db()
        assert admin_user.is_staff is False
        assert admin_user.is_superuser is False

    def test_admins_can_promote_a_customer(self, admin_user, customer):
        resp = client_for(admin_user).post(
            reverse("admin-customer-set-staff", args=[customer.pk]), {"is_staff": True}, format="json"
        )
        assert resp.status_code == status.HTTP_200_OK
        customer.refresh_from_db()
        assert customer.is_staff is True
        assert customer.is_superuser is False

    def test_admins_can_demote_another_admin(self, admin_user, second_admin):
        resp = client_for(admin_user).post(
            reverse("admin-customer-set-staff", args=[second_admin.pk]), {"is_staff": False}, format="json"
        )
        assert resp.status_code == status.HTTP_200_OK
        second_admin.refresh_from_db()
        assert second_admin.is_staff is False

    def test_admins_cannot_change_a_superuser(self, admin_user, second_superuser):
        resp = client_for(admin_user).post(
            reverse("admin-customer-set-staff", args=[second_superuser.pk]), {"is_staff": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        second_superuser.refresh_from_db()
        assert second_superuser.is_staff is True
        assert second_superuser.is_superuser is True

    def test_missing_flag_is_rejected(self, staff_client, admin_user):
        """A body without is_staff must not silently demote the account."""
        resp = staff_client.post(reverse("admin-customer-set-staff", args=[admin_user.pk]), {}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        admin_user.refresh_from_db()
        assert admin_user.is_staff is True

    def test_superuser_targets_are_untouchable(self, staff_client, second_superuser):
        resp = staff_client.post(
            reverse("admin-customer-set-staff", args=[second_superuser.pk]), {"is_staff": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "Superuser" in resp.data["detail"]
        second_superuser.refresh_from_db()
        assert second_superuser.is_staff is True
        assert second_superuser.is_superuser is True

    def test_nobody_can_change_their_own_admin_status(self, staff_client, staff_user):
        resp = staff_client.post(
            reverse("admin-customer-set-staff", args=[staff_user.pk]), {"is_staff": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "your own" in resp.data["detail"]

    def test_admins_cannot_change_their_own_status(self, admin_user):
        resp = client_for(admin_user).post(
            reverse("admin-customer-set-staff", args=[admin_user.pk]), {"is_staff": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "your own" in resp.data["detail"]
        admin_user.refresh_from_db()
        assert admin_user.is_staff is True


class TestSetActive:
    def test_admin_can_block_and_unblock_a_customer(self, admin_user, customer):
        client = client_for(admin_user)
        url = reverse("admin-customer-set-active", args=[customer.pk])

        assert client.post(url, {"is_active": False}, format="json").status_code == status.HTTP_200_OK
        customer.refresh_from_db()
        assert customer.is_active is False

        assert client.post(url, {"is_active": True}, format="json").status_code == status.HTTP_200_OK
        customer.refresh_from_db()
        assert customer.is_active is True

    def test_superuser_cannot_be_blocked(self, staff_client, second_superuser):
        resp = staff_client.post(
            reverse("admin-customer-set-active", args=[second_superuser.pk]), {"is_active": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        second_superuser.refresh_from_db()
        assert second_superuser.is_active is True

    def test_admins_can_block_and_unblock_other_admins(self, admin_user, second_admin):
        client = client_for(admin_user)
        url = reverse("admin-customer-set-active", args=[second_admin.pk])

        assert client.post(url, {"is_active": False}, format="json").status_code == status.HTTP_200_OK
        second_admin.refresh_from_db()
        assert second_admin.is_active is False

        assert client.post(url, {"is_active": True}, format="json").status_code == status.HTTP_200_OK
        second_admin.refresh_from_db()
        assert second_admin.is_active is True

    def test_admins_cannot_block_superusers(self, admin_user, second_superuser):
        resp = client_for(admin_user).post(
            reverse("admin-customer-set-active", args=[second_superuser.pk]), {"is_active": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        second_superuser.refresh_from_db()
        assert second_superuser.is_active is True

    def test_superuser_can_block_an_admin(self, staff_client, admin_user):
        url = reverse("admin-customer-set-active", args=[admin_user.pk])

        assert staff_client.post(url, {"is_active": False}, format="json").status_code == status.HTTP_200_OK
        admin_user.refresh_from_db()
        assert admin_user.is_active is False

        assert staff_client.post(url, {"is_active": True}, format="json").status_code == status.HTTP_200_OK
        admin_user.refresh_from_db()
        assert admin_user.is_active is True

    def test_nobody_can_block_themselves(self, staff_client, staff_user):
        resp = staff_client.post(
            reverse("admin-customer-set-active", args=[staff_user.pk]), {"is_active": False}, format="json"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "your own account" in resp.data["detail"]


class TestProfileEdits:
    def test_patch_cannot_change_status_fields(self, staff_client, second_superuser):
        """Profile edits must not become a back door around set_active/set_staff."""
        resp = staff_client.patch(
            reverse("admin-customer-detail", args=[second_superuser.pk]),
            {"first_name": "Renamed", "is_active": False, "is_staff": False, "is_superuser": False},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        second_superuser.refresh_from_db()
        assert second_superuser.first_name == "Renamed"
        assert second_superuser.is_active is True
        assert second_superuser.is_staff is True
        assert second_superuser.is_superuser is True


class TestRoleFilters:
    def _emails(self, response):
        return {row["email"] for row in response.data["results"]}

    def test_superuser_filter(self, staff_client, staff_user, second_superuser, admin_user, customer):
        resp = staff_client.get(reverse("admin-customer-list"), {"is_superuser": "true"})
        assert self._emails(resp) == {staff_user.email, second_superuser.email}

    def test_admin_filter(self, staff_client, staff_user, second_superuser, admin_user, customer):
        resp = staff_client.get(reverse("admin-customer-list"), {"is_staff": "true", "is_superuser": "false"})
        assert self._emails(resp) == {admin_user.email}

    def test_customer_filter(self, staff_client, staff_user, second_superuser, admin_user, customer):
        resp = staff_client.get(reverse("admin-customer-list"), {"is_staff": "false"})
        assert self._emails(resp) == {customer.email}
