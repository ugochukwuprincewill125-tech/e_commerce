"""
Backblaze B2 helpers for direct browser uploads.

The normal flow uploads files through Django. On serverless hosts (e.g. Vercel
~4.5MB request cap) large product photos cannot pass through the API, so the
admin panel instead:

1. POSTs a tiny JSON request to /api/admin-api/uploads/sign/
                                        -> receives a presigned PUT URL
2. PUTs the file straight to Backblaze   (browser -> B2, server untouched)
3. Sends the resulting key back to the product endpoint (`uploaded_images`),
   which is verified and stored as the ProductImage image name.

Two layers of naming:
  * B2 object key   = "media/products/<id>/<rand>-<name>.<ext>"  (storage
    location "media" is part of the key) — used for signing & existence checks
  * Django filename = "products/<id>/<rand>-<name>.<ext>"       — what the
    ImageField stores; the storage layer re-applies the location prefix

Keys are signed with an exact ContentType and expire in 15 minutes.
When B2_* is not configured (local dev), signing falls back to a tiny
staff-only PUT view that writes into the local media folder, so the admin
frontend can use the identical flow offline.
"""
import re
import secrets

from django.conf import settings

# How long a presigned URL stays valid (signature window, not download TTL).
SIGNING_TTL_SECONDS = 15 * 60

# Cap per direct upload — generous for product photography, small enough that
# a signed URL can't be abused as an unlimited dumping ground.
MAX_DIRECT_UPLOAD_BYTES = 10 * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
}

# Full-key shape this module signs (own product folder only).
_KEY_RE = re.compile(r"^media/products/\d+/[A-Za-z0-9._-]+$")


def b2_configured() -> bool:
    return bool(
        settings.B2_APPLICATION_KEY_ID
        and settings.B2_APPLICATION_KEY
        and settings.B2_BUCKET_NAME
        and settings.B2_ENDPOINT_URL
    )


def _s3_client():
    """One boto3 client for signing and existence checks (same creds as storage)."""
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=settings.B2_ENDPOINT_URL,
        aws_access_key_id=settings.B2_APPLICATION_KEY_ID,
        aws_secret_access_key=settings.B2_APPLICATION_KEY,
        region_name=(settings.B2_ENDPOINT_URL.split("//")[1].split(".")[1] if settings.B2_ENDPOINT_URL else None),
    )


def _validate(content_type: str, filename: str) -> str:
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if not ext:
        raise ValueError("Unsupported image type. Use JPEG, PNG, WebP or AVIF.")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError("Invalid filename.")
    return ext


def make_key(product_id: int, filename: str, content_type: str) -> str:
    """Full B2 key: media/products/<id>/<rand>-<safe-stem><ext>"""
    ext = _validate(content_type, filename)
    stem = re.sub(r"[^A-Za-z0-9._-]", "", filename.rsplit(".", 1)[0])[:60] or "image"
    return f"media/products/{product_id}/{secrets.token_hex(4)}-{stem}{ext}"


def key_to_field_name(key: str) -> str:
    """'media/products/1/a.jpg' -> ImageField name 'products/1/a.jpg'."""
    return key.removeprefix("media/")


def sign_product_image(product_id: int, filename: str, content_type: str) -> dict:
    """
    Return a presigned PUT payload for one product image.

      upload_url — absolute URL the browser PUTs the raw file bytes to
      key        — full B2 key; echo it back via `uploaded_images`
      headers    — exact headers the browser must send with the PUT
      expires_in — seconds the signature stays valid
    """
    key = make_key(product_id, filename, content_type)

    if not b2_configured():
        from django.urls import reverse

        from urllib.parse import quote

        url = reverse("admin-upload-local") + "?key=" + quote(key, safe="")
        return {
            "upload_url": url,
            "key": key,
            "headers": {"Content-Type": content_type},
            "expires_in": SIGNING_TTL_SECONDS,
            "storage": "local",
        }

    client = _s3_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.B2_BUCKET_NAME, "Key": key, "ContentType": content_type},
        ExpiresIn=SIGNING_TTL_SECONDS,
    )
    return {
        "upload_url": upload_url,
        "key": key,
        "headers": {"Content-Type": content_type},
        "expires_in": SIGNING_TTL_SECONDS,
        "storage": "b2",
    }


def key_is_wellformed(key: str) -> bool:
    """Only accept keys this module could have signed (own product folder)."""
    return bool(key) and bool(_KEY_RE.match(key))


def object_exists(key: str) -> bool:
    """Verify a direct upload actually landed before attaching it."""
    if b2_configured():
        client = _s3_client()
        try:
            client.head_object(Bucket=settings.B2_BUCKET_NAME, Key=key)
            return True
        except Exception:
            return False
    from django.core.files.storage import default_storage

    return default_storage.exists(key_to_field_name(key))


def write_local(key: str, content: bytes, content_type: str) -> None:
    """Local-dev sink for the fallback PUT view (B2 never touched)."""
    _validate(content_type, key.rsplit("/", 1)[-1])
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    default_storage.save(key_to_field_name(key), ContentFile(content))
