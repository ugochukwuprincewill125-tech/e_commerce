"""
Thin Paystack client. The secret key is read from settings (environment) and
is only ever used server-side. Docs: https://paystack.com/docs/api/transaction/
"""
import hashlib
import hmac
import logging
from decimal import Decimal

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class PaystackError(Exception):
    pass


def _headers():
    if not settings.PAYSTACK_SECRET_KEY:
        raise PaystackError("Paystack is not configured. Set PAYSTACK_SECRET_KEY in backend/.env.")
    return {"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"}


def to_kobo(amount_naira):
    return int((Decimal(amount_naira) * 100).quantize(Decimal("1")))


def initialize_transaction(*, email, amount_naira, reference, callback_url, metadata=None):
    payload = {
        "email": email,
        "amount": to_kobo(amount_naira),
        "currency": "NGN",
        "reference": reference,
        "callback_url": callback_url,
        "metadata": metadata or {},
    }
    try:
        resp = requests.post(f"{settings.PAYSTACK_BASE_URL}/transaction/initialize", json=payload, headers=_headers(), timeout=20)
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Paystack initialize failed")
        raise PaystackError("We couldn't reach the payment provider. Please try again.") from exc
    if not resp.ok or not body.get("status"):
        raise PaystackError(body.get("message") or "Payment could not be initialized.")
    return body["data"]


def verify_transaction(reference):
    try:
        resp = requests.get(f"{settings.PAYSTACK_BASE_URL}/transaction/verify/{reference}", headers=_headers(), timeout=20)
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Paystack verify failed")
        raise PaystackError("We couldn't confirm the payment right now. Please try again shortly.") from exc
    if not resp.ok or not body.get("status"):
        raise PaystackError(body.get("message") or "Payment verification failed.")
    return body["data"]


def valid_webhook_signature(raw_body: bytes, signature: str) -> bool:
    if not settings.PAYSTACK_SECRET_KEY or not signature:
        return False
    expected = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


def refund_transaction(reference, amount_naira=None):
    """Initiate a refund via Paystack.

    If ``amount_naira`` is given the refund is partial (in Naira, converted to
    kobo); otherwise the full transaction amount is refunded.
    """
    payload = {"reference": reference}
    if amount_naira is not None:
        payload["amount"] = to_kobo(amount_naira)
    try:
        resp = requests.post(f"{settings.PAYSTACK_BASE_URL}/refund", json=payload, headers=_headers(), timeout=20)
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.exception("Paystack refund failed")
        raise PaystackError("We couldn't process the refund right now. Please try again.") from exc
    if not resp.ok or not body.get("status"):
        raise PaystackError(body.get("message") or "Refund could not be processed.")
    return body["data"]


def partial_refund_amount(payment, amount):
    """Return the kobo amount to refund, capped at the paid value."""
    refund_kobo = to_kobo(amount)
    paid_kobo = to_kobo(payment.amount)
    return min(refund_kobo, paid_kobo)
