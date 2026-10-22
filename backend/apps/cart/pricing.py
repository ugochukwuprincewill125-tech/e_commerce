"""
Server-side pricing. The browser never decides what anything costs — every
total shown in the cart, checkout and payment is produced here.
"""
from decimal import Decimal

from django.conf import settings

from apps.core.store import (
    NORTH_STATES,
    SOUTH_EAST_SOUTH_SOUTH_STATES,
    SOUTH_WEST_STATES,
)
from apps.promotions.models import Coupon

ZERO = Decimal("0.00")

# Cities in the Ikorodu corridor are priced by couriers with the Ogun/South
# West band, not Lagos metro. These markers are checked against the free-text
# city field only; "Ikorodu Road" (which runs through the mainland metro)
# is explicitly excluded.
_REMOTE_LAGOS_CITIES = ("ikorodu", "igbogbo", "ijede", "imota", "agbowa", "odogunyan")
_REMOTE_LAGOS_EXCLUDE = ("road", "express", " rd ")

_ZONE_FEE_SETTINGS = {
    "lagos": "SHIPPING_FEE_LAGOS",
    "south_west": "SHIPPING_FEE_SOUTH_WEST",
    "south_east": "SHIPPING_FEE_SOUTH_EAST_SOUTH_SOUTH",
    "north": "SHIPPING_FEE_NORTH",
    "default": "SHIPPING_FEE_DEFAULT",
}


def _is_remote_lagos_city(city):
    text = (city or "").strip().lower()
    if not text:
        return False
    text = f" {' '.join(text.split())} "
    if not any(marker in text for marker in _REMOTE_LAGOS_CITIES):
        return False
    return not any(marker in text for marker in _REMOTE_LAGOS_EXCLUDE)


def resolve_shipping_zone(state, city=""):
    """Map a delivery address to one of the four priced zones."""
    key = (state or "").strip().lower()
    if key == "lagos":
        return "south_west" if _is_remote_lagos_city(city) else "lagos"
    if key in SOUTH_WEST_STATES:
        return "south_west"
    if key in SOUTH_EAST_SOUTH_SOUTH_STATES:
        return "south_east"
    if key in NORTH_STATES:
        return "north"
    return "default"


def shipping_fee_for(subtotal, state, delivery_method="delivery", city=""):
    if delivery_method == "pickup" or subtotal <= 0:
        return ZERO
    if subtotal >= settings.FREE_SHIPPING_THRESHOLD:
        return ZERO
    zone = resolve_shipping_zone(state, city)
    return Decimal(getattr(settings, _ZONE_FEE_SETTINGS[zone]))


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


def calculate_totals(subtotal, coupon_code="", state="", delivery_method="delivery", city=""):
    subtotal = Decimal(subtotal).quantize(Decimal("0.01"))
    coupon, coupon_info = resolve_coupon(coupon_code, subtotal)
    discount = Decimal(coupon_info["discount"])
    shipping = shipping_fee_for(subtotal, state, delivery_method, city)
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


def build_quote(cart, coupon_code="", state="", delivery_method="delivery", city=""):
    totals = calculate_totals(cart_subtotal(cart), coupon_code, state, delivery_method, city)
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
