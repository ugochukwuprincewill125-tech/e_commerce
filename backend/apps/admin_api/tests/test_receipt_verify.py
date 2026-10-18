"""Tests for the staff-only receipt verification endpoint.

The receipt-verify tool must never be reachable by customers, and a genuine
check must identify the ONE order (owner + items) a receipt belongs to, so a
receipt cannot be claimed by somebody else or reused for another purchase.
The first successful check of a paid receipt is recorded — who verified it and
when — and repeat checks must report that instead of passing it as fresh.
"""
import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.orders.models import PaymentStatus
from apps.orders.receipt_codes import verification_code
from apps.users.models import User


def staff_member(email, first_name, last_name):
    return User.objects.create_user(
        email=email,
        first_name=first_name,
        last_name=last_name,
        password="StaffPass123!",
        is_staff=True,
    )


def client_for(user):
    from rest_framework_simplejwt.tokens import AccessToken

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


@pytest.mark.django_db
class TestAdminReceiptVerify:
    def _verify(self, client, order, code=None):
        return client.get(
            reverse("admin-receipt-verify"),
            {"order_number": order.order_number, "code": code or verification_code(order)},
        )

    def test_anonymous_rejected(self, api_client, paid_order):
        resp = api_client.get(
            reverse("admin-receipt-verify"),
            {"order_number": paid_order.order_number, "code": verification_code(paid_order)},
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_customer_rejected(self, auth_client, paid_order):
        resp = self._verify(auth_client, paid_order)
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_genuine_receipt_shows_owner_items_and_payment(self, staff_client, paid_order):
        resp = self._verify(staff_client, paid_order)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is True
        data = resp.data["order"]
        assert data["order_number"] == paid_order.order_number
        assert data["is_paid"] is True
        # The response names the order's owner — not whoever ran the check.
        assert data["customer_name"] == "Test Customer"
        assert data["email"] == "customer@example.com"
        assert data["payment_reference"] == paid_order.payment_reference
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["product_name"] == paid_order.items.first().product_name
        assert item["quantity"] == 1
        assert item["unit_price"] == str(paid_order.items.first().unit_price)

    def test_first_check_records_the_verifier(self, staff_client, staff_user, paid_order):
        before = timezone.now()
        resp = self._verify(staff_client, paid_order)

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["already_verified"] is False
        assert resp.data["recorded"] is True
        assert resp.data["verified_by"] == "Admin User"

        paid_order.refresh_from_db()
        assert paid_order.receipt_verified_by == staff_user
        assert before <= paid_order.receipt_verified_at <= timezone.now()
        assert resp.data["verified_at"] == paid_order.receipt_verified_at

    def test_repeat_check_reports_the_first_verification(self, staff_client, paid_order):
        self._verify(staff_client, paid_order)
        paid_order.refresh_from_db()
        first_at = paid_order.receipt_verified_at
        first_by = paid_order.receipt_verified_by
        assert first_at is not None

        # A different staff member checks the same receipt later.
        other = staff_member("second-checker@example.com", "Second", "Checker")
        resp = self._verify(client_for(other), paid_order)

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is True
        assert resp.data["already_verified"] is True
        assert resp.data["recorded"] is False
        # The FIRST verification is reported — name and date.
        assert resp.data["verified_by"] == "Admin User"
        assert resp.data["verified_at"] == first_at

        # Repeat checks never overwrite the original record.
        paid_order.refresh_from_db()
        assert paid_order.receipt_verified_at == first_at
        assert paid_order.receipt_verified_by == first_by

    def test_failed_checks_are_not_recorded(self, staff_client, paid_order):
        resp = self._verify(staff_client, paid_order, code="AAAA-BBBB-CCCC")
        assert resp.data["valid"] is False
        paid_order.refresh_from_db()
        assert paid_order.receipt_verified_at is None
        assert paid_order.receipt_verified_by is None

    def test_refunded_receipt_is_not_recorded_as_verified(self, staff_client, paid_order):
        paid_order.payment_status = PaymentStatus.REFUNDED
        paid_order.refund_amount = paid_order.total
        paid_order.refund_reason = "Returned"
        paid_order.refunded_at = timezone.now()
        paid_order.save()

        resp = self._verify(staff_client, paid_order)
        assert resp.data["valid"] is True
        assert resp.data["already_verified"] is False
        assert resp.data["recorded"] is False
        assert resp.data["verified_at"] is None
        assert resp.data["verified_by"] is None
        paid_order.refresh_from_db()
        assert paid_order.receipt_verified_at is None

    def test_deleting_the_verifier_keeps_the_verification(self, staff_client, staff_user, paid_order):
        self._verify(staff_client, paid_order)

        staff_user.delete()
        paid_order.refresh_from_db()
        # The timestamp survives; only the name is gone (FK set to NULL).
        assert paid_order.receipt_verified_at is not None
        assert paid_order.receipt_verified_by is None

        # A later check still warns that it was verified — without a name.
        checker = staff_member("later-checker@example.com", "Later", "Checker")
        resp = self._verify(client_for(checker), paid_order)
        assert resp.data["already_verified"] is True
        assert resp.data["verified_by"] is None

    def test_wrong_code_fails(self, staff_client, paid_order):
        resp = self._verify(staff_client, paid_order, code="AAAA-BBBB-CCCC")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is False
        assert "did not come from us" in resp.data["detail"]

    def test_unknown_order_fails(self, staff_client):
        resp = staff_client.get(
            reverse("admin-receipt-verify"),
            {"order_number": "TGS-000000-NOPE1", "code": "AAAA-BBBB-CCCC"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is False

    def test_missing_fields_rejected(self, staff_client):
        resp = staff_client.get(reverse("admin-receipt-verify"), {"order_number": "", "code": ""})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_refunded_receipt_is_genuine_but_not_proof_of_payment(self, staff_client, paid_order):
        paid_order.payment_status = PaymentStatus.REFUNDED
        paid_order.refund_amount = paid_order.total
        paid_order.refund_reason = "Returned"
        paid_order.refunded_at = timezone.now()
        paid_order.save()

        resp = self._verify(staff_client, paid_order)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["valid"] is True
        assert resp.data["order"]["is_paid"] is False
        assert resp.data["order"]["payment_status"] == PaymentStatus.REFUNDED
        assert "not proof" in resp.data["detail"]

    def test_public_verify_endpoint_is_removed(self, auth_client, paid_order):
        """Customers must have no way to run the check any more.

        The old public path now only collides with the order-detail route, so
        an authenticated customer gets a plain 404 — never a verification
        result.
        """
        resp = auth_client.get(
            "/api/orders/verify-receipt/",
            {"order_number": paid_order.order_number, "code": verification_code(paid_order)},
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_old_verify_path_is_not_public(self, paid_order):
        """No sign-in, no check: the old path cannot be probed by anyone."""
        resp = APIClient().get(
            "/api/orders/verify-receipt/",
            {"order_number": paid_order.order_number, "code": verification_code(paid_order)},
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
