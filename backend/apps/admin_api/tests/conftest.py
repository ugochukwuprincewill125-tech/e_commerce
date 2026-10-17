"""Shared fixtures for the admin API test-suite."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.brands.models import Brand
from apps.cart.models import Cart, CartItem
from apps.categories.models import Category
from apps.products.models import Product

User = get_user_model()


@pytest.fixture
def customer(db):
    return User.objects.create_user(
        email="customer@example.com",
        first_name="Test",
        last_name="Customer",
        password="TestPass123!",
        email_verified=True,
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_superuser(
        email="admin@example.com",
        first_name="Admin",
        last_name="User",
        password="AdminPass123!",
        email_verified=True,
    )


@pytest.fixture
def product(db):
    category = Category.objects.create(name="Gadgets", slug="gadgets", is_active=True)
    brand = Brand.objects.create(name="TestBrand", slug="testbrand", is_active=True)
    return Product.objects.create(
        name="Test Widget",
        slug="test-widget",
        sku="TGS-WGT-001",
        category=category,
        brand=brand,
        product_type="accessory",
        price=Decimal("500.00"),
        stock_quantity=50,
        is_active=True,
    )


@pytest.fixture
def paid_order(db, customer, product):
    """A fully paid order — the only kind that ever receives a receipt."""
    from apps.orders.services import create_order_from_cart, mark_order_paid

    cart = Cart.objects.create(user=customer)
    CartItem.objects.create(cart=cart, product=product, quantity=1)
    order = create_order_from_cart(
        customer,
        cart,
        {
            "first_name": "Test",
            "last_name": "Customer",
            "email": "customer@example.com",
            "phone": "08000000000",
            "delivery_method": "pickup",
            "pickup_location": "main-office",
        },
    )
    order, _ = mark_order_paid(order, f"{order.order_number}-TESTREF")
    return order


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(api_client, customer):
    from rest_framework_simplejwt.tokens import AccessToken

    token = str(AccessToken.for_user(customer))
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client


@pytest.fixture
def staff_client(api_client, staff_user):
    from rest_framework_simplejwt.tokens import AccessToken

    token = str(AccessToken.for_user(staff_user))
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client
