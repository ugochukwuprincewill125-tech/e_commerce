"""Variation-linked product images.

Admins attach a photo to one variation so the storefront shows it when the
customer picks that option (red powerbank photo on "Red", etc.). Tested here:
image serializers expose `variant`, PATCH links/unlinks safely, the
sign->PUT->attach flow accepts {"key", "variant"} pairings, the create call
maps images[] to variations by index, and variation rows without an SKU get
a generated unique one.
"""
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.core import uploads
from apps.products.models import Product, ProductImage, ProductVariant, VariantType


@pytest.fixture
def local_uploads(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    }
    return tmp_path


@pytest.fixture
def red(db, product):
    return ProductVariant.objects.create(
        product=product, variant_type="color", value="Red", sku="TGS-WGT-RED", stock_quantity=5,
    )


@pytest.fixture
def blue(db, product):
    return ProductVariant.objects.create(
        product=product, variant_type="color", value="Blue", sku="TGS-WGT-BLU", stock_quantity=8,
    )


@pytest.fixture
def photo(db, product):
    return ProductImage.objects.create(product=product, image="products/photo.jpg", display_order=1)


def _image_url(product_pk):
    return f"/api/admin-api/products/{product_pk}/images"


def _jpeg(name="red.jpg"):
    return SimpleUploadedFile(name, b"\xff\xd8fake-jpeg-bytes", content_type="image/jpeg")


@pytest.mark.django_db
class TestVariantExposure:
    def test_public_serializer_reports_variant_links(self, product, red, photo):
        photo.variant = red
        photo.save(update_fields=["variant"])
        from apps.products.serializers import ProductDetailSerializer

        data = ProductDetailSerializer(product).data
        img = data["images"][0]
        assert img["variant"] == red.pk
        assert img["variant_value"] == "Red"

    def test_admin_detail_serializer_reports_variant_links(self, staff_client, product, red, photo):
        photo.variant = red
        photo.save(update_fields=["variant"])
        resp = staff_client.get(f"/api/admin-api/products/{product.pk}/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["images"][0]["variant"] == red.pk

    def test_size_is_a_valid_variation_kind(self):
        assert VariantType.SIZE == "size"


@pytest.mark.django_db
class TestImageVariantLinking:
    def test_link_and_unlink_via_patch(self, staff_client, product, red, photo):
        url = f"{_image_url(product.pk)}/{photo.pk}/"

        resp = staff_client.patch(url, {"variant": red.pk}, format="json")
        assert resp.status_code == status.HTTP_200_OK
        photo.refresh_from_db()
        assert photo.variant_id == red.pk
        assert resp.data["variant_value"] == "Red"

        resp = staff_client.patch(url, {"variant": None}, format="json")
        assert resp.status_code == status.HTTP_200_OK
        photo.refresh_from_db()
        assert photo.variant_id is None

    def test_rejects_a_foreign_variation(self, staff_client, product, photo, db):
        # A variant that belongs to a different product must be refused.
        foreign = ProductVariant.objects.create(
            product=Product.objects.create(
                name="Other", slug="other", sku="TGS-OTH-001",
                category=Category.objects.create(name="C2", slug="c2"),
                brand=Brand.objects.create(name="B2", slug="b2"),
                product_type="accessory", price=100,
            ),
            variant_type="color", value="Green", sku="TGS-OTH-GRN",
        )
        url = f"{_image_url(product.pk)}/{photo.pk}/"
        resp = staff_client.patch(url, {"variant": foreign.pk}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        photo.refresh_from_db()
        assert photo.variant_id is None


@pytest.mark.django_db
class TestUploadedImagesPairings:
    def _sign_and_put(self, staff_client, product):
        sign = staff_client.post(
            "/api/admin-api/uploads/sign/",
            {"items": [{"filename": "red.jpg", "content_type": "image/jpeg", "product_id": product.pk}]},
            format="json",
        )
        [signed] = sign.data["uploads"]
        put = staff_client.put(signed["upload_url"], data=b"\xff\xd8jpg", content_type="image/jpeg")
        assert put.status_code == status.HTTP_200_OK
        return signed["key"]

    def test_key_with_variant_attaches_linked(self, staff_client, product, red, local_uploads):
        key = self._sign_and_put(staff_client, product)
        resp = staff_client.patch(
            f"/api/admin-api/products/{product.pk}/",
            {"uploaded_images": [{"key": key, "variant": red.pk}]},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        img = ProductImage.objects.get(image=uploads.key_to_field_name(key))
        assert img.variant_id == red.pk

    def test_plain_key_still_attaches_unlinked(self, staff_client, product, local_uploads):
        key = self._sign_and_put(staff_client, product)
        resp = staff_client.patch(
            f"/api/admin-api/products/{product.pk}/",
            {"uploaded_images": [key]},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert ProductImage.objects.get(image=uploads.key_to_field_name(key)).variant_id is None

    def test_pairing_with_unknown_variant_rejected(self, staff_client, product, local_uploads):
        key = self._sign_and_put(staff_client, product)
        resp = staff_client.patch(
            f"/api/admin-api/products/{product.pk}/",
            {"uploaded_images": [{"key": key, "variant": 987654321}]},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestCreateFlow:
    def test_images_map_to_variants_by_index_and_skus_generated(self, staff_client, local_uploads, db):
        from apps.brands.models import Brand
        from apps.categories.models import Category

        category = Category.objects.create(name="Power", slug="power")
        resp = staff_client.post(
            "/api/admin-api/products/",
            data={
                "name": "Solar Powerbank",
                "sku": "TGS-PWB-001",
                "category": category.pk,
                "product_type": "power",
                "price": "15000",
                "stock_quantity": "10",
                "variants": json.dumps([
                    {"variant_type": "color", "value": "Red", "stock_quantity": 4, "price_adjustment": 500},
                    {"variant_type": "color", "value": "Blue", "stock_quantity": 6, "price_adjustment": 0},
                ]),
                "images[]": [_jpeg("red.jpg"), _jpeg("blue.jpg")],
                "image_variants": json.dumps([0, 1]),
            },
            format="multipart",
        )
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        product = resp.data
        variants = {v["value"]: v for v in product["variants"]}
        red_id, blue_id = variants["Red"]["id"], variants["Blue"]["id"]
        images = {i["variant_value"]: i["variant"] for i in product["images"]}
        assert images["Red"] == red_id
        assert images["Blue"] == blue_id
        # No SKU was sent; the server generates unique ones.
        skus = [v["sku"] for v in product["variants"]]
        assert len(set(skus)) == 2 and all(skus)

    def test_unmapped_image_stays_general(self, staff_client, local_uploads, db):
        from apps.brands.models import Brand
        from apps.categories.models import Category

        category = Category.objects.create(name="Power", slug="power")
        resp = staff_client.post(
            "/api/admin-api/products/",
            data={
                "name": "Solar Powerbank 2",
                "sku": "TGS-PWB-002",
                "category": category.pk,
                "product_type": "power",
                "price": "15000",
                "stock_quantity": "10",
                "variants": json.dumps([{"variant_type": "color", "value": "Red"}]),
                "images[]": [_jpeg("general.jpg")],
                "image_variants": json.dumps([None]),
            },
            format="multipart",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data["images"][0]["variant"] is None
