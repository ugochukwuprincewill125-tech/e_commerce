"""Delivery-zone pricing tests.

The four zones are: Lagos metro, South West (incl. the Ikorodu corridor),
South East/South South + Kwara, and the northern band (plus Akwa Ibom and
Cross River). Fees come from settings so they can be changed without a deploy.
"""
from decimal import Decimal

import pytest

from apps.cart.pricing import calculate_totals, resolve_shipping_zone, shipping_fee_for
from apps.cart.views import QuoteSerializer


@pytest.mark.parametrize(
    ("state", "city", "zone"),
    [
        ("Lagos", "Ikeja", "lagos"),
        (" lagos ", "Surulere", "lagos"),
        ("Lagos", "Ikorodu", "south_west"),
        ("Lagos", " IKORODU TOWN ", "south_west"),
        ("Lagos", "Igbogbo", "south_west"),
        ("Lagos", "Ikorodu Road", "lagos"),
        ("Lagos", "Ikorodu Rd", "lagos"),
        ("Ogun", "Abeokuta", "south_west"),
        ("Oyo", "Ibadan", "south_west"),
        ("Osun", "", "south_west"),
        ("Ondo", "", "south_west"),
        ("Ekiti", "", "south_west"),
        ("Abia", "", "south_east"),
        ("Anambra", "", "south_east"),
        ("Ebonyi", "", "south_east"),
        ("Imo", "", "south_east"),
        ("Enugu", "", "south_east"),
        ("Edo", "", "south_east"),
        ("Delta", "", "south_east"),
        ("Rivers", "", "south_east"),
        ("Bayelsa", "", "south_east"),
        ("Kwara", "Ilorin", "south_east"),
        ("FCT - Abuja", "", "north"),
        ("Abuja", "", "north"),
        ("Plateau", "", "north"),
        ("Kano", "", "north"),
        ("Kaduna", "", "north"),
        ("Akwa Ibom", "", "north"),
        ("Cross River", "", "north"),
        ("", "", "default"),
        ("Atlantis", "", "default"),
    ],
)
def test_resolve_shipping_zone(state, city, zone):
    assert resolve_shipping_zone(state, city) == zone


def test_fees_come_from_settings(settings):
    settings.SHIPPING_FEE_LAGOS = 1111
    settings.SHIPPING_FEE_SOUTH_WEST = 2222
    settings.SHIPPING_FEE_SOUTH_EAST_SOUTH_SOUTH = 3333
    settings.SHIPPING_FEE_NORTH = 4444
    settings.SHIPPING_FEE_DEFAULT = 5555

    assert shipping_fee_for(Decimal("50000"), "Lagos", city="Ikeja") == Decimal("1111")
    assert shipping_fee_for(Decimal("50000"), "Lagos", city="Ikorodu") == Decimal("2222")
    assert shipping_fee_for(Decimal("50000"), "Enugu") == Decimal("3333")
    assert shipping_fee_for(Decimal("50000"), "Kano") == Decimal("4444")
    assert shipping_fee_for(Decimal("50000"), "Unknown") == Decimal("5555")


def test_pickup_and_empty_cart_are_free(settings):
    settings.SHIPPING_FEE_LAGOS = 3500
    assert shipping_fee_for(Decimal("50000"), "Lagos", delivery_method="pickup") == Decimal("0")
    assert shipping_fee_for(Decimal("0"), "Lagos") == Decimal("0")


def test_free_shipping_threshold(settings):
    settings.FREE_SHIPPING_THRESHOLD = 100000
    settings.SHIPPING_FEE_LAGOS = 3500
    assert shipping_fee_for(Decimal("100000"), "Lagos") == Decimal("0")
    assert shipping_fee_for(Decimal("99999"), "Lagos") == Decimal("3500")


def test_totals_use_the_delivery_zone(settings):
    settings.SHIPPING_FEE_LAGOS = 3500
    settings.SHIPPING_FEE_SOUTH_WEST = 6500

    lagos = calculate_totals(Decimal("50000"), "", "Lagos", "delivery", "Ikeja")
    ikorodu = calculate_totals(Decimal("50000"), "", "Lagos", "delivery", "Ikorodu")

    assert lagos["shipping_fee"] == Decimal("3500")
    assert lagos["total"] == Decimal("53500")
    assert ikorodu["shipping_fee"] == Decimal("6500")
    assert ikorodu["total"] == Decimal("56500")


def test_quote_serializer_accepts_city():
    serializer = QuoteSerializer(data={"state": "Lagos", "city": "Ikorodu"})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["city"] == "Ikorodu"
