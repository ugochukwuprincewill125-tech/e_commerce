"""
Image upload helpers for the admin panel (Cloudinary backend).

The admin panel:
1. POSTs a tiny JSON request to /api/admin-api/uploads/sign/
   -> receives a same-origin upload URL (browser -> Django -> Cloudinary)
2. PUTs the file to that URL
3. Sends the resulting key back to the product endpoint (`uploaded_images`),
   which is verified and stored as the ProductImage image name.
"""
import re
import secrets

from django.conf import settings

SIGNING_TTL_SECONDS = 15 * 60
MAX_DIRECT_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB per image via the PUT endpoint

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}

_KEY_RE = re.compile(r"^media/products/\d+/[A-Za-z0-9._-]+$")


def cloudinary_configured() -> bool:
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    )


def _validate(content_type: str, filename: str) -> str:
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if not ext:
        raise ValueError("Unsupported image type. Use JPEG, PNG, WebP or AVIF.")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError("Invalid filename.")
    return ext


def make_key(product_id: int, filename: str, content_type: str) -> str:
    ext = _validate(content_type, filename)
    stem = re.sub(r"[^A-Za-z0-9._-]", "", filename.rsplit(".", 1)[0])[:60] or "image"
    return f"media/products/{product_id}/{secrets.token_hex(4)}-{stem}{ext}"


def key_to_field_name(key: str) -> str:
    return key.removeprefix("media/")


def sign_product_image(product_id: int, filename: str, content_type: str) -> dict:
    from urllib.parse import quote
    from django.urls import reverse

    key = make_key(product_id, filename, content_type)
    url = reverse("admin-upload-local") + "?key=" + quote(key, safe="")
    return {
        "upload_url": url,
        "key": key,
        "headers": {"Content-Type": content_type},
        "expires_in": SIGNING_TTL_SECONDS,
        "storage": "cloudinary" if cloudinary_configured() else "local",
    }


def key_is_wellformed(key: str) -> bool:
    return bool(key) and bool(_KEY_RE.match(key))


def object_exists(key: str) -> bool:
    from django.core.files.storage import default_storage

    return default_storage.exists(key_to_field_name(key))


def write_local(key: str, content: bytes, content_type: str) -> None:
    _validate(content_type, key.rsplit("/", 1)[-1])
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    default_storage.save(key_to_field_name(key), ContentFile(content))
