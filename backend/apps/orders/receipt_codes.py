"""Tamper-evident receipt codes.

A receipt's code is an HMAC (keyed with the server SECRET_KEY) over the
receipt's key facts — who paid, how much, the payment reference and the
moment it cleared. Only receipts this backend actually issued can produce a
code that re-derives correctly, so a doctored screenshot that "looks" like a
receipt will fail the staff receipt check (/api/admin/receipts/verify/) the
moment anybody checks it.

The code needs no storage: it is derived from the order row itself, so it
survives database restores and cannot get out of sync with reality. Forging
it would require the secret key, which never leaves the server.
"""
import hashlib
import hmac
from decimal import Decimal

from django.conf import settings

VERSION = "r2"  # bump if the fact layout ever changes

# xx-char lowercase digest -> XXXX-XXXX-XXXX for people to read out loud.
CODE_GROUPS = 3
CODE_GROUP_LEN = 4


def receipt_facts(order) -> bytes:
    total = Decimal(order.total).quantize(Decimal("0.01"))
    paid = order.paid_at or order.created_at
    return "|".join(
        [
            VERSION,
            order.order_number,
            str(order.pk),
            order.email.lower(),
            f"{total}",
            order.payment_reference or "-",
            paid.strftime("%Y%m%d%H%M"),
        ]
    ).encode()


def verification_code(order) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode(), receipt_facts(order), hashlib.sha256
    ).hexdigest()
    body = digest[: CODE_GROUPS * CODE_GROUP_LEN].upper()
    return "-".join(body[i : i + CODE_GROUP_LEN] for i in range(0, len(body), CODE_GROUP_LEN))


def code_matches(order, candidate: str) -> bool:
    normalized = (candidate or "").strip().upper().replace(" ", "").replace("-", "")
    return hmac.compare_digest(verification_code(order).replace("-", ""), normalized)
