"""Shared fixtures for the ai_chat app test-suite."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.orders.models import Order
from apps.products.models import Product

User = get_user_model()


@pytest.fixture
def shopper(db):
    """An ordinary customer."""
    return User.objects.create_user(
        email="shopper@example.com",
        first_name="Ada",
        last_name="Shopper",
        password="TestPass123!",
        email_verified=True,
    )


@pytest.fixture
def shopper2(db):
    """A second customer, for cross-customer access checks."""
    return User.objects.create_user(
        email="other@example.com",
        first_name="Bola",
        last_name="Other",
        password="TestPass123!",
        email_verified=True,
    )


@pytest.fixture
def staff_member(db):
    return User.objects.create_user(
        email="staff@example.com",
        first_name="Sade",
        last_name="Staff",
        password="TestPass123!",
        email_verified=True,
        is_staff=True,
    )


@pytest.fixture
def category(db):
    return Category.objects.create(name="Gadgets", slug="gadgets", is_active=True)


@pytest.fixture
def second_category(db):
    return Category.objects.create(name="Archived goods", slug="archived-goods", is_active=False)


@pytest.fixture
def brand(db):
    return Brand.objects.create(name="TestBrand", slug="testbrand", is_active=True)


@pytest.fixture
def product(db, category, brand):
    return Product.objects.create(
        name="Test Widget",
        slug="test-widget",
        sku="TGS-WGT-001",
        category=category,
        brand=brand,
        product_type="accessory",
        price=500,
        discount_price=400,
        stock_quantity=50,
        is_active=True,
    )


@pytest.fixture
def archived_product(db, second_category, brand):
    """A product in an inactive category — hidden from customers."""
    return Product.objects.create(
        name="Secret Gizmo",
        slug="secret-gizmo",
        sku="TGS-GZM-001",
        category=second_category,
        brand=brand,
        product_type="accessory",
        price=9000,
        stock_quantity=10,
        is_active=True,
    )


@pytest.fixture
def order(db, shopper):
    return Order.objects.create(
        user=shopper,
        order_number="TGS-260101-AAA11",
        status="payment_confirmed",
        payment_status="paid",
        subtotal=800,
        total=835,
        shipping_fee=35,
        first_name="Ada",
        last_name="Shopper",
        email="shopper@example.com",
        phone="08000000000",
        delivery_method="delivery",
        shipping_address={"address": "1 Example Close", "city": "Ikeja", "state": "Lagos"},
        carrier="GIG",
        tracking_number="GIG-TEST-001",
    )


@pytest.fixture
def api_client_auth(shopper):
    client = APIClient()
    client.force_authenticate(user=shopper)
    return client
