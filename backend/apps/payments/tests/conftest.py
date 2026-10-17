"""Shared fixtures for the payments app test-suite."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.brands.models import Brand
from apps.cart.models import Cart, CartItem
from apps.categories.models import Category
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.payments.models import Payment
from apps.products.models import Product, ProductVariant

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
def category(db):
    return Category.objects.create(name="Gadgets", slug="gadgets", is_active=True)


@pytest.fixture
def brand(db):
    return Brand.objects.create(name="TestBrand", slug="testbrand", is_active=True)


@pytest.fixture
def product(db, category, brand):
    p = Product.objects.create(
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
    return p


@pytest.fixture
def product_variant(db, product):
    return ProductVariant.objects.create(
        product=product,
        variant_type="color",
        value="Black",
        sku="TGS-WGT-001-BK",
        price_adjustment=Decimal("0.00"),
        stock_quantity=10,
        color_hex="#000000",
        is_active=True,
    )


@pytest.fixture
def cart_with_items(db, customer, product, product_variant):
    cart = Cart.objects.create(user=customer)
    CartItem.objects.create(cart=cart, product=product, selected_variant=product_variant, quantity=2)
    return cart


@pytest.fixture
def order(db, customer, product, product_variant):
    from apps.orders.services import create_order_from_cart

    cart = Cart.objects.create(user=customer)
    CartItem.objects.create(cart=cart, product=product, selected_variant=product_variant, quantity=1)
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
    return order


@pytest.fixture
def payment(db, order):
    ref = f"{order.order_number}-A1B2C3D4"
    return Payment.objects.create(
        order=order,
        provider=Payment.Provider.PAYSTACK,
        reference=ref,
        amount=order.total,
        currency="NGN",
        status=Payment.Status.INITIALIZED,
        # A real initialized payment always carries the hosted checkout URL.
        authorization_url="https://paystack.com/pay/test-link",
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(api_client, customer):
    from rest_framework_simplejwt.tokens import AccessToken

    token = str(AccessToken.for_user(customer))
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client

