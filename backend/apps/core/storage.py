"""
Media storage for Timeline Global Systems.

Product/category/brand images live in a Backblaze B2 bucket, accessed through
B2's S3-compatible API (django-storages + boto3). Files are uploaded directly
by Django and served from the bucket's public endpoint (or a CDN custom domain
if one is configured).

Selected automatically when all of these are set in the environment:
    B2_APPLICATION_KEY_ID
    B2_APPLICATION_KEY
    B2_BUCKET_NAME
    B2_ENDPOINT_URL        e.g. https://s3.us-west-004.backblazeb2.com

Without them (local development) Django falls back to FileSystemStorage and
files land in backend/media/ — no behaviour change for existing code.
"""
from storages.backends.s3boto3 import S3Boto3Storage


class StaticMediaStorageMixin:
    """Shared settings for every Timeline media bucket."""

    default_acl = "public-read"          # images are browsable by URL
    querystring_auth = False             # no signed URLs — the bucket is public
    file_overwrite = False               # keep every upload, never clobber
    object_parameters = {"CacheControl": "public, max-age=31536000"}  # 1 year


class BackblazeMediaStorage(StaticMediaStorageMixin, S3Boto3Storage):
    """All MEDIA_ROOT-relative uploads go here (products/, users/, …)."""

    location = "media"
