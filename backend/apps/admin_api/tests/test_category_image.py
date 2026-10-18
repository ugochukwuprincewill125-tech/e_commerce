"""Category cover images: sign -> PUT -> attach via `image_key`.

Categories reuse the product image pipeline — signed keys live under
media/categories/<id>/, the browser PUTs bytes to the signed URL (Cloudinary in
production, the local media folder in development), and the returned key is
attached with a PATCH. The attach step must reject anything that did not go
through this API, and "" must clear the image.
"""
import pytest
from django.urls import reverse
from rest_framework import status

from apps.categories.models import Category
from apps.core import uploads


@pytest.fixture
def local_uploads(settings, tmp_path):
    """Keep uploads in a throwaway folder — never backend/media or Cloudinary."""
    settings.MEDIA_ROOT = tmp_path
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    }
    return tmp_path


@pytest.fixture
def category(db, local_uploads):
    return Category.objects.create(name="Cameras", slug="cameras")


@pytest.mark.django_db
class TestCategoryImageUpload:
    def _sign(self, client, category, filename="body.jpg", content_type="image/jpeg"):
        return client.post(
            reverse("admin-upload-sign"),
            {"items": [{"filename": filename, "content_type": content_type, "category_id": category.pk}]},
            format="json",
        )

    def _patch(self, client, category, payload):
        return client.patch(reverse("admin-category-detail", args=[category.pk]), payload, format="json")

    def test_sign_issues_a_key_in_the_category_space(self, staff_client, category):
        resp = self._sign(staff_client, category)
        assert resp.status_code == status.HTTP_200_OK
        [signed] = resp.data["uploads"]
        assert signed["key"].startswith(f"media/categories/{category.pk}/")
        assert uploads.key_is_wellformed(signed["key"])
        assert "uploads/local" in signed["upload_url"]

    def test_sign_rejects_items_without_exactly_one_target(self, staff_client, category):
        resp = staff_client.post(
            reverse("admin-upload-sign"),
            {"items": [{"filename": "a.jpg", "content_type": "image/jpeg"}]},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        resp = staff_client.post(
            reverse("admin-upload-sign"),
            {"items": [{"filename": "a.jpg", "content_type": "image/jpeg",
                        "category_id": category.pk, "product_id": 1}]},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_sign_rejects_unknown_category(self, staff_client):
        resp = staff_client.post(
            reverse("admin-upload-sign"),
            {"items": [{"filename": "a.jpg", "content_type": "image/jpeg", "category_id": 999999}]},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_sign_is_staff_only(self, auth_client, category):
        assert self._sign(auth_client, category).status_code == status.HTTP_403_FORBIDDEN

    def test_put_then_attach_roundtrip(self, staff_client, category):
        [signed] = self._sign(staff_client, category).data["uploads"]
        put = staff_client.put(signed["upload_url"], data=b"\xff\xd8fake-jpeg-data",
                               content_type="image/jpeg")
        assert put.status_code == status.HTTP_200_OK

        resp = self._patch(staff_client, category, {"image_key": signed["key"]})
        assert resp.status_code == status.HTTP_200_OK
        category.refresh_from_db()
        assert category.image.name == uploads.key_to_field_name(signed["key"])
        assert resp.data["image"].endswith(".jpg")

    def test_attach_rejects_keys_outside_the_category_space(self, staff_client, category):
        resp = self._patch(staff_client, category, {"image_key": "media/products/1/abcd-photo.jpg"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_attach_rejects_unsigned_keys(self, staff_client, category):
        resp = self._patch(staff_client, category, {"image_key": "media/categories/1/../escape.jpg"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_attach_rejects_a_key_that_was_never_uploaded(self, staff_client, category):
        resp = self._patch(staff_client, category,
                           {"image_key": f"media/categories/{category.pk}/abcd-missing.jpg"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_empty_key_clears_the_image(self, staff_client, category):
        category.image = "categories/legacy.jpg"
        category.save(update_fields=["image"])

        resp = self._patch(staff_client, category, {"image_key": ""})
        assert resp.status_code == status.HTTP_200_OK
        category.refresh_from_db()
        assert not category.image
