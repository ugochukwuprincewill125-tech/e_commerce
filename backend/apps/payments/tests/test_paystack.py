"""Tests for the Paystack HTTP client (apps/payments/paystack.py)."""
import hashlib
import hmac
from decimal import Decimal
from unittest.mock import patch

import pytest
import requests
import responses as resp

from apps.payments import paystack


# --------------------------- to_kobo --------------------------- #
class TestToKobo:
    def test_whole_amount(self):
        assert paystack.to_kobo(Decimal("1000.00")) == 100000

    def test_fractional_amount(self):
        assert paystack.to_kobo(Decimal("1000.50")) == 100050

    def test_rounding(self):
        assert paystack.to_kobo(Decimal("99.999")) == 10000  # quantize to 0.01 -> 100.00 -> 10000

    def test_from_float(self):
        assert paystack.to_kobo(1000.0) == 100000

    def test_from_string(self):
        assert paystack.to_kobo("500.25") == 50025


# ---------------------- initialize_transaction ------------------ #
class TestInitializeTransaction:
    @resp.activate
    def test_success(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(
            resp.POST,
            "https://api.paystack.co/transaction/initialize",
            json={"status": True, "data": {"authorization_url": "https://paystack.com/pay/abc", "access_code": "code123"}},
            status=200,
        )
        data = paystack.initialize_transaction(
            email="customer@example.com",
            amount_naira=Decimal("5000.00"),
            reference="TGS-240101-XYZ-1234",
            callback_url="http://localhost:5173/payment/callback",
            metadata={"order_number": "TGS-240101-XYZ"},
        )
        assert data["authorization_url"] == "https://paystack.com/pay/abc"
        assert data["access_code"] == "code123"

    @resp.activate
    def test_failure_raises_paystack_error(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(
            resp.POST,
            "https://api.paystack.co/transaction/initialize",
            json={"status": False, "message": "Invalid reference"},
            status=400,
        )
        with pytest.raises(paystack.PaystackError, match="Invalid reference"):
            paystack.initialize_transaction(
                email="x@example.com", amount_naira=100, reference="ref", callback_url="http://x", metadata={}
            )

    @resp.activate
    def test_network_error_raises_paystack_error(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(resp.POST, "https://api.paystack.co/transaction/initialize", body=requests.ConnectionError("timeout"))
        with pytest.raises(paystack.PaystackError, match="couldn't reach"):
            paystack.initialize_transaction(
                email="x@example.com", amount_naira=100, reference="ref", callback_url="http://x", metadata={}
            )

    def test_missing_secret_raises(self, settings):
        settings.PAYSTACK_SECRET_KEY = ""
        with pytest.raises(paystack.PaystackError, match="not configured"):
            paystack.initialize_transaction(
                email="x@example.com", amount_naira=100, reference="ref", callback_url="http://x", metadata={}
            )


# ------------------------ verify_transaction -------------------- #
class TestVerifyTransaction:
    @resp.activate
    def test_success(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(
            resp.GET,
            "https://api.paystack.co/transaction/verify/TGS-240101-XYZ-1234",
            json={"status": True, "data": {"status": "success", "amount": 500000, "currency": "NGN", "reference": "TGS-240101-XYZ-1234"}},
            status=200,
        )
        data = paystack.verify_transaction("TGS-240101-XYZ-1234")
        assert data["status"] == "success"
        assert data["amount"] == 500000

    @resp.activate
    def test_failure_raises(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(
            resp.GET,
            "https://api.paystack.co/transaction/verify/bad-ref",
            json={"status": False, "message": "Reference not found"},
            status=404,
        )
        with pytest.raises(paystack.PaystackError, match="Reference not found"):
            paystack.verify_transaction("bad-ref")

    @resp.activate
    def test_unknown_reference_raises_not_found(self, settings):
        """The live API answers unknown references with HTTP 400 + 'Transaction
        reference not found.' — recognised distinctly so callers can close
        stale attempts instead of retrying them forever."""
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(
            resp.GET,
            "https://api.paystack.co/transaction/verify/unknown-ref",
            json={"status": False, "message": "Transaction reference not found."},
            status=400,
        )
        with pytest.raises(paystack.PaystackNotFound, match="not found"):
            paystack.verify_transaction("unknown-ref")

    @resp.activate
    def test_other_400s_stay_generic_errors(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_dummy"
        settings.PAYSTACK_BASE_URL = "https://api.paystack.co"
        resp.add(
            resp.GET,
            "https://api.paystack.co/transaction/verify/bad-ref",
            json={"status": False, "message": "Invalid key"},
            status=400,
        )
        with pytest.raises(paystack.PaystackError) as excinfo:
            paystack.verify_transaction("bad-ref")
        assert not isinstance(excinfo.value, paystack.PaystackNotFound)


# --------------------- webhook signature ------------------------ #
class TestWebhookSignature:
    def test_valid_signature(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_secret_key"
        body = b'{"event":"charge.success","data":{"reference":"REF-123"}}'
        sig = hmac.new(b"sk_test_secret_key", body, hashlib.sha512).hexdigest()
        assert paystack.valid_webhook_signature(body, sig) is True

    def test_invalid_signature(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_secret_key"
        body = b'{"event":"charge.success"}'
        assert paystack.valid_webhook_signature(body, "wrong-signature") is False

    def test_missing_secret(self, settings):
        settings.PAYSTACK_SECRET_KEY = ""
        assert paystack.valid_webhook_signature(b"body", "sig") is False

    def test_missing_signature(self, settings):
        settings.PAYSTACK_SECRET_KEY = "sk_test_secret_key"
        assert paystack.valid_webhook_signature(b"body", "") is False

