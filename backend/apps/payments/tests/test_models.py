"""Tests for the Payment model."""
from decimal import Decimal

import pytest

from apps.payments.models import Payment


@pytest.mark.django_db
class TestPaymentModel:
    def test_create_payment_defaults(self, payment, order):
        assert payment.status == Payment.Status.INITIALIZED
        assert payment.currency == "NGN"
        assert payment.provider == Payment.Provider.PAYSTACK
        assert payment.amount == order.total
        assert payment.refund_note == ""

    def test_str_representation(self, payment):
        assert str(payment) == f"{payment.reference} (Initialized)"

    def test_reference_unique(self, db, order):
        ref = f"{order.order_number}-A1B2C3D4"
        Payment.objects.create(order=order, reference=ref, amount=Decimal("500.00"))
        with pytest.raises(Exception):
            Payment.objects.create(order=order, reference=ref, amount=Decimal("500.00"))

    def test_status_choices(self):
        assert Payment.Status.INITIALIZED == "initialized"
        assert Payment.Status.SUCCESS == "success"
        assert Payment.Status.FAILED == "failed"
        assert Payment.Status.ABANDONED == "abandoned"

    def test_provider_choices(self):
        assert Payment.Provider.PAYSTACK == "paystack"
        assert Payment.Provider.TEST == "test"

    def test_ordering_meta(self):
        assert Payment._meta.ordering == ("-created_at",)

    def test_refund_note_can_be_set(self, payment):
        payment.refund_note = "Customer requested refund for damaged item"
        payment.save()
        payment.refresh_from_db()
        assert payment.refund_note == "Customer requested refund for damaged item"

    def test_initial_state_fields(self, db, order):
        """A freshly created payment should have sensible defaults."""
        p = Payment.objects.create(
            order=order,
            provider=Payment.Provider.PAYSTACK,
            reference=f"{order.order_number}-TESTREF",
            amount=Decimal("1000.00"),
        )
        assert p.status == Payment.Status.INITIALIZED
        assert p.currency == "NGN"
        assert p.created_at is not None
        assert p.verified_at is None
        assert p.channel == ""
        assert p.gateway_response == ""

