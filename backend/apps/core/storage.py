"""
Media storage for Timeline Global Systems.

Product/category/brand images live in Cloudinary, accessed through
django-cloudinary-storage. Files are uploaded by Django and served from
Cloudinary's CDN — public URLs, no bucket-permission plumbing.

Selected automatically when all of these are set in the environment:
    CLOUDINARY_CLOUD_NAME
    CLOUDINARY_API_KEY
    CLOUDINARY_API_SECRET

Without them (local development) Django falls back to FileSystemStorage and
files land in backend/media/ — no behaviour change for existing code.
"""
import os

import cloudinary
from cloudinary_storage.storage import MediaCloudinaryStorage


class CloudinaryMediaStorage(MediaCloudinaryStorage):
    """
    All MEDIA_ROOT-relative uploads go here (products/, users/, …).

    The library's default uploader derives the Cloudinary public_id from the
    filename with a RANDOM suffix and strips the extension, so the name Django
    stores never matches a key this API signed. Our sign → PUT → attach flow
    needs the opposite: the exact key that was issued must resolve afterwards
    (and re-uploads of the same key must overwrite, not duplicate). These
    overrides pin a deterministic public_id — ``media/<field name>`` minus the
    extension — making uploads idempotent and verifiable.
    """

    def _upload(self, name, content):
        return cloudinary.uploader.upload(
            content,
            public_id=self._public_id_for(name),
            resource_type=self._get_resource_type(name),
            tags=self.TAG,
            invalidate=True,
        )

    def delete(self, name):
        response = cloudinary.uploader.destroy(
            self._public_id_for(name),
            invalidate=True,
            resource_type=self._get_resource_type(name),
        )
        return response.get("result") == "ok"

    def _public_id_for(self, name):
        """'products/76/drone.jpg' → Cloudinary public_id 'media/products/76/drone'.

        The delivery URL keeps the extension (Cloudinary reads it as the
        format), while the stored resource id carries none — this mirrors how
        the library itself structures image uploads.
        """
        prefixed = self._prepend_prefix(self._normalise_name(name))
        return os.path.splitext(prefixed)[0]
