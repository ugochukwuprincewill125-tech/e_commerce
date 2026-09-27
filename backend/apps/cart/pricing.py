"""
Server-side pricing. The browser never decides what anything costs — every
total shown in the cart, checkout and payment is produced here.
"""
from decimal import Decimal

from django.conf import settings

from apps.core.store import SOUTH_WEST_STATES
from apps.promotions.models import Coupon

ZERO = Decimal("0.00")


def shipping_fee_for(subtotal, state, delivery_method="delivery"):
    if delivery_method == "pickup" or subtotal <= 0:
        return ZERO
    if subtotal >= settings.FREE_SHIPPING_THRESHOLD:
        return ZERO
    key = (state or "").strip().lower()
    if key == "lagos":
        return Decimal(settings.SHIPPING_FEE_LAGOS)
    if key in SOUTH_WEST_STATES:
        return Decimal(settings.SHIPPING_FEE_SOUTH_WEST)
    return Decimal(settings.SHIPPING_FEE_DEFAULT)


def resolve_coupon(code, subtotal):
    """Return (coupon_or_None, info_dict)."""
    code = (code or "").strip().upper()
    if not code:
        return None, {"code": "", "valid": False, "message": "", "discount": "0.00"}
    coupon = Coupon.objects.filter(code=code).first()
    if not coupon:
        return None, {"code": code, "valid": False, "message": "This coupon code is not valid.", "discount": "0.00"}
    valid, message = coupon.check_valid(subtotal)
    if not valid:
        return None, {"code": code, "valid": False, "message": message, "discount": "0.00"}
    discount = coupon.discount_for(subtotal)
    return coupon, {"code": code, "valid": True, "message": message, "discount": str(discount), "description": coupon.description}


def calculate_totals(subtotal, coupon_code="", state="", delivery_method="delivery"):
    subtotal = Decimal(subtotal).quantize(Decimal("0.01"))
    coupon, coupon_info = resolve_coupon(coupon_code, subtotal)
    discount = Decimal(coupon_info["discount"])
    shipping = shipping_fee_for(subtotal, state, delivery_method)
    total = max(subtotal - discount, ZERO) + shipping
    return {
        "coupon_obj": coupon,
        "subtotal": subtotal,
        "discount": discount,
        "shipping_fee": shipping,
        "total": total.quantize(Decimal("0.01")),
        "coupon": coupon_info,
        "shipping_estimated": bool(state) or delivery_method == "pickup",
    }


def cart_subtotal(cart):
    return sum((item.line_total for item in cart.items.all()), ZERO)


def build_quote(cart, coupon_code="", state="", delivery_method="delivery"):
    totals = calculate_totals(cart_subtotal(cart), coupon_code, state, delivery_method)
    totals.pop("coupon_obj")
    return {
        "subtotal": str(totals["subtotal"]),
        "discount": str(totals["discount"]),
        "shipping_fee": str(totals["shipping_fee"]),
        "total": str(totals["total"]),
        "coupon": totals["coupon"],
        "shipping_estimated": totals["shipping_estimated"],
        "free_shipping_threshold": settings.FREE_SHIPPING_THRESHOLD,
        "delivery_method": delivery_method,
        "state": state,
    }
