"""Staff-only REST API for managing the Timeline Gadgets store.

Every view requires an authenticated user with `is_staff=True` (admins and
superusers). Panel users manage the store and each other, with two hard
limits: superuser accounts are never modifiable through the API, and nobody
can change their own access. The admin frontend sends `Authorization: Bearer
<access>` just like the customer API.
"""
import json
from datetime import timedelta

import django_filters
from django.conf import settings
from django.db import transaction
from django.db.models import Count, DecimalField, Max, Prefetch, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.core import uploads
from apps.core.models import ContactMessage
from apps.notifications.events import send_order_refunded, send_order_status_email
from apps.orders.models import DeliveryMethod, Order, OrderItem, OrderStatus, PaymentStatus, status_flow
from apps.orders.receipt_codes import code_matches
from apps.orders.services import cancel_order, mark_order_paid
from apps.products.filters import CharInFilter, search_q
from apps.products.models import Availability, Product, ProductImage, ProductVariant
from apps.promotions.models import Coupon
from apps.reviews.models import Review
from apps.users.models import User

from . import serializers as s


class IsStaff(permissions.IsAdminUser):
    """Admin API gate — any panel user may manage the store.

    Admins (``is_staff``) and superusers (``is_superuser``) have the same
    powers here, including managing other admins. The one thing nobody can
    change through this API is a superuser account — see
    `AdminCustomerViewSet`.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class AdminProductFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method="filter_search")
    category = django_filters.CharFilter(method="filter_category")
    brand = CharInFilter(field_name="brand__slug")
    product_type = CharInFilter(field_name="product_type")
    availability = CharInFilter(field_name="availability")
    min_price = django_filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price", lookup_expr="lte")
    featured = django_filters.BooleanFilter()
    bestseller = django_filters.BooleanFilter()
    new_arrival = django_filters.BooleanFilter()
    is_active = django_filters.BooleanFilter()
    low_stock = django_filters.BooleanFilter(method="filter_low_stock")

    class Meta:
        model = Product
        fields = []

    def filter_low_stock(self, queryset, name, value):
        """The restock worklist: at or under the threshold, but not sold out."""
        if not value:
            return queryset
        threshold = getattr(settings, "LOW_STOCK_THRESHOLD", 5)
        return queryset.filter(stock_quantity__lte=threshold).exclude(stock_quantity=0)

    def filter_search(self, queryset, name, value):
        value = value.strip()
        return queryset.filter(search_q(value)).distinct() if value else queryset

    def filter_category(self, queryset, name, value):
        category = Category.objects.filter(slug=value).first()
        return queryset.filter(category_id__in=category.get_descendant_ids()) if category else queryset.none()


VARIANT_FIELDS = {
    "variant_type", "value", "sku", "price_adjustment",
    "stock_quantity", "color_hex", "is_active", "display_order",
}


def _attach_uploaded_images(product, entries):
    """Attach images uploaded via the sign+PUT flow through `uploaded_images`.
    Entries may be plain keys or {"key": "…", "variant": <id>} objects — the
    latter links the new photo to a specific variant so the storefront shows it
    when the customer picks that option. Each key is verified against the
    signer's key space AND existence in the bucket before a row is created."""
    if not entries:
        return
    start = (product.images.aggregate(m=Max("display_order"))["m"] or 0) + 1
    rows = []
    for index, entry in enumerate(entries):
        payload = entry if isinstance(entry, dict) else {"key": entry}
        key = payload.get("key", "")
        if not uploads.key_is_wellformed(key):
            raise ValidationError(f"Upload key {key!r} was not issued by this API.")
        if not uploads.object_exists(key):
            raise ValidationError(
                f"Upload for {key!r} not found — upload the file to the signed URL first."
            )
        name = uploads.key_to_field_name(key)
        stem = name.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        safe_stem = stem.split("-", 1)[-1] or stem
        variant = None
        variant_ref = payload.get("variant")
        if variant_ref not in (None, "", "null"):
            variant = ProductVariant.objects.filter(product=product, pk=variant_ref).first()
            if not variant:
                raise ValidationError(
                    f"Variation {variant_ref!r} does not belong to this product."
                )
        rows.append(ProductImage(
            product=product, image=name, variant=variant,
            alt_text=safe_stem.replace("-", " ")[:200],
            display_order=start + index,
        ))
    ProductImage.objects.bulk_create(rows)


def _generate_variant_sku(product):
    """A unique SKU for a variation the admin added without typing one —
    derived from the product SKU so stock labels stay human-readable."""
    base = (product.sku or f"P{product.pk}")[:54]
    n = 1
    while ProductVariant.objects.filter(sku=f"{base}-V{n}").exists():
        n += 1
    return f"{base}-V{n}"


def _save_product_children(product, images=None, variants=None, uploaded_images=None):
    """Apply image/variant writes after the product row is saved.

    images:   [{"id": 4, "alt_text": "…", "display_order": 1, "variant": 7,
               "variant": None}, …] — metadata updates for existing rows
              (`variant` links the photo to an option; absent = leave as-is).
              File uploads are handled separately.
    variants: the FULL desired variant list; existing rows missing from it are
              deactivated rather than deleted so past orders stay intact.
    Returns the saved variants in payload order, so `image_variants` indexes
    from the create/update call can be resolved to ids.
    """
    saved_variants = []
    if variants is not None:
        desired = []
        for payload in variants:
            payload = {k: v for k, v in payload.items() if k in VARIANT_FIELDS or k == "id"}
            variant_id = payload.pop("id", None)
            if variant_id:
                variant = ProductVariant.objects.filter(product=product, pk=variant_id).first()
                if not variant:
                    raise ValidationError(f"Variant {variant_id} does not belong to this product.")
                for field, value in payload.items():
                    setattr(variant, field, value)
                variant.is_active = True
                variant.save()
            else:
                if not payload.get("sku"):
                    payload["sku"] = _generate_variant_sku(product)
                variant = ProductVariant.objects.create(product=product, **payload)
            desired.append(variant.pk)
            saved_variants.append(variant)
        product.variants.exclude(pk__in=desired).update(is_active=False)

    if images:
        for payload in images:
            image_id = payload.get("id")
            if not image_id:
                raise ValidationError(
                    "Only existing images can be updated here; upload new ones"
                    " via images[] or uploaded_images."
                )
            updates = {
                "alt_text": payload.get("alt_text", ""),
                "display_order": payload.get("display_order", 0),
            }
            variant_ref = payload.get("variant", "__absent__")
            if variant_ref != "__absent__":
                if variant_ref in (None, "", "null"):
                    updates["variant"] = None  # unlink: becomes a general photo
                else:
                    linked = ProductVariant.objects.filter(
                        product=product, pk=variant_ref
                    ).first()
                    if not linked:
                        raise ValidationError(
                            f"Variation {variant_ref!r} does not belong to this product."
                        )
                    updates["variant"] = linked
            ProductImage.objects.filter(product=product, pk=image_id).update(**updates)
    return saved_variants


MAX_PRODUCT_IMAGE_BYTES = 4 * 1024 * 1024  # 4MB per product image


class AdminProductViewSet(viewsets.ModelViewSet):
    """
    GET    /api/admin/products/            ?search=&category=&brand=&product_type=&availability=&is_active=&featured=&ordering=
    POST   /api/admin/products/            multipart/form-data: fields + images[] files + image_alt_texts JSON + variants JSON
    GET    /api/admin/products/<id>/
    PATCH  /api/admin/products/<id>/       partial update; may include images JSON (metadata) and variants JSON (full set)
    DELETE /api/admin/products/<id>/       soft delete — hides from the store, keeps order history intact
    POST   /api/admin/products/<id>/restore/
    POST   /api/admin/products/<id>/set_featured/  {featured}
    """
    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = AdminProductFilter
    ordering_fields = ["created_at", "name", "price", "stock_quantity", "rating", "review_count"]
    ordering = ["-created_at"]

    queryset = (
        Product.objects.all()
        .select_related("brand", "category")
        .prefetch_related(
            Prefetch("images", queryset=ProductImage.objects.order_by("display_order", "id")),
            "variants",
        )
    )

    def get_serializer_class(self):
        if self.action == "list":
            return s.AdminProductListSerializer
        if self.action in ("create", "update", "partial_update"):
            return s.AdminProductWriteSerializer
        return s.AdminProductDetailSerializer

    def _parse_json_list(self, key):
        raw = self.request.data.get(key)
        if not raw:
            return None
        if isinstance(raw, list):
            return raw
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            raise ValidationError(f"{key} must be valid JSON.")
        if not isinstance(value, list):
            raise ValidationError(f"{key} must be a JSON array.")
        return value

    def _handle_uploads(self, product, variant_ids_by_index=None):
        """Create ProductImage rows from the multipart `images` file field.
        Accepts both `images` and `images[]` field names (axios vs jQuery style).

        Files are re-keyed with apps.core.uploads.make_key — the same
        media/products/<pid>/<hex>-<name>.<ext> scheme the sign→PUT flow
        issues — so every upload lands in the product's folder with a unique
        name and DB rows stay consistent across both upload paths."""
        from django.core.files.base import ContentFile
        from django.core.files.storage import default_storage

        files = self.request.FILES.getlist("images") or self.request.FILES.getlist("images[]")
        if not files:
            return
        for file in files:
            if file.size > MAX_PRODUCT_IMAGE_BYTES:
                raise ValidationError(f'{file.name} is larger than 4MB. Please compress it before uploading.')
        try:
            alt_texts = self._parse_json_list("image_alt_texts") or []
        except ValidationError:
            alt_texts = []
        start = (product.images.aggregate(m=Max("display_order"))["m"] or 0) + 1
        rows = []
        for i, file in enumerate(files):
            try:
                key = uploads.make_key(product.pk, file.name, file.content_type or "image/jpeg")
            except ValueError as exc:
                raise ValidationError(f"{file.name}: {exc}")
            name = uploads.key_to_field_name(key)
            default_storage.save(name, ContentFile(file.read()))
            variant = None
            if variant_ids_by_index:
                try:
                    variant = variant_ids_by_index[i] or None
                except IndexError:
                    raise ValidationError(
                        "image_variants must be aligned with images[] — one entry per file."
                    )
            rows.append(ProductImage(
                product=product, image=name, variant=variant,
                alt_text=alt_texts[i] if i < len(alt_texts) else "",
                display_order=start + i,
            ))
        ProductImage.objects.bulk_create(rows)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        variants = self._parse_json_list("variants")
        saved_variants = _save_product_children(product, variants=variants)
        image_variants = self._parse_json_list("image_variants")  # per images[] file: variant index or null
        self._handle_uploads(
            product,
            variant_ids_by_index=(
                [(saved_variants[i] if i is not None and 0 <= i < len(saved_variants) else None)
                 for i in image_variants]
                if image_variants else None
            ),
        )
        _attach_uploaded_images(product, self._parse_json_list("uploaded_images"))
        product = self.queryset.get(pk=product.pk)  # fresh copy, relations not stale
        return Response(
            s.AdminProductDetailSerializer(product, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        saved_variants = _save_product_children(
            product,
            images=self._parse_json_list("images"),
            variants=self._parse_json_list("variants"),
        )
        image_variants = self._parse_json_list("image_variants")  # per images[] file: variant index or null
        self._handle_uploads(
            product,
            variant_ids_by_index=(
                [(saved_variants[i] if i is not None and 0 <= i < len(saved_variants) else None)
                 for i in image_variants]
                if image_variants else None
            ),
        )
        _attach_uploaded_images(product, self._parse_json_list("uploaded_images"))
        product = self.queryset.get(pk=product.pk)  # fresh product, relations not stale
        return Response(s.AdminProductDetailSerializer(product, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        """Soft delete: hide from the store, keep history and analytics."""
        product = self.get_object()
        product.is_active = False
        product.save(update_fields=["is_active", "updated_at"])
        product.variants.update(is_active=False)
        return Response(
            {"detail": f"{product.name} archived. It is hidden from the store and can be restored."},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        product = self.get_object()
        product.is_active = True
        product.save(update_fields=["is_active", "updated_at"])
        product.variants.update(is_active=True)
        return Response({"detail": f"{product.name} restored to the store."})

    @action(detail=True, methods=["post"])
    def delete_forever(self, request, pk=None):
        """Hard delete an archived product — there is no undo.

        Past orders stay intact: order items denormalise name/SKU/price and
        their product FK is SET_NULL on delete. Everything else (images,
        variants, reviews, wishlist and cart rows) is removed, and the image
        files are deleted from Cloudinary so no orphans linger."""
        from django.core.files.storage import default_storage

        product = self.get_object()
        name = product.name
        order_items = product.order_items.count()

        for image in product.images.all():
            try:
                default_storage.delete(str(image.image))
            except Exception:
                pass  # a CDN hiccup must not block the deletion

        product.delete()
        suffix = f" {order_items} past order item(s) keep their records." if order_items else ""
        return Response({"detail": f"{name} permanently deleted.{suffix}"})

    @action(detail=True, methods=["post"])
    def set_featured(self, request, pk=None):
        product = self.get_object()
        product.featured = bool(request.data.get("featured", not product.featured))
        product.save(update_fields=["featured", "updated_at"])
        return Response({"detail": f"{product.name}: featured={product.featured}"})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def adjust_stock(self, request, pk=None):
        """Set or nudge the stock level after a delivery or stock count.

        `delta` moves the count by a signed amount (a correction, shrinkage or
        top-up); `quantity` sets it outright. Recalculating `availability` is
        what keeps the Low Stock / Out of Stock badges honest.
        """
        product = self.get_object()
        has_delta = "delta" in request.data
        has_quantity = "quantity" in request.data

        if has_delta == has_quantity:
            raise ValidationError("Send either `delta` (signed change) or `quantity` (set outright), not both.")

        before = product.stock_quantity
        if has_delta:
            try:
                delta = int(request.data["delta"])
            except (TypeError, ValueError):
                raise ValidationError("`delta` must be a whole number.")
            new_stock = before + delta
        else:
            try:
                new_stock = int(request.data["quantity"])
            except (TypeError, ValueError):
                raise ValidationError("`quantity` must be a whole number.")

        if new_stock < 0:
            raise ValidationError("Stock cannot go below zero.")

        product.stock_quantity = new_stock
        product.save(update_fields=["stock_quantity", "availability", "updated_at"])

        variant_id = request.data.get("variant_id")
        touched = "product"
        if variant_id:
            variant = product.variants.filter(pk=variant_id).first()
            if not variant:
                raise ValidationError(f"Variant {variant_id} does not belong to {product.name}.")
            variant.stock_quantity = new_stock
            variant.save(update_fields=["stock_quantity"])
            touched = f"variant {variant.label}"

        return Response({
            "detail": f"{touched} stock: {before} → {new_stock} ({product.get_availability_display()}).",
            "stock_quantity": product.stock_quantity,
            "availability": product.availability,
        })

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        """GET /api/admin-api/products/low_stock/ — the restock worklist."""
        qs = (self.get_queryset()
              .filter(is_active=True, stock_quantity__lte=getattr(settings, "LOW_STOCK_THRESHOLD", 5))
              .order_by("stock_quantity"))
        page = self.paginate_queryset(qs)
        serializer = s.AdminProductListSerializer(page, many=True, context={"request": request})
        return self.get_paginated_response(serializer.data)


class DirectUploadView(APIView):
    """
    POST /api/admin-api/uploads/sign/
    {"items": [{"filename": "macbook.jpg", "content_type": "image/jpeg", "product_id": 7}, …]}
    or        [{"filename": "phones.jpg",  "content_type": "image/jpeg", "category_id": 12}, …]
    -> {"uploads": [{"upload_url", "key", "headers", "expires_in", "storage"}, …]}

    Issues upload URLs so the browser can PUT image bytes (Cloudinary-backed
    in production; local media fallback in development). Each item targets
    exactly one existing row: product images are echoed back via
    `uploaded_images` on the product create/update call, category images via
    `image_key` on the category update call.
    """

    permission_classes = [IsStaff]

    def post(self, request):
        items = request.data.get("items")
        if not isinstance(items, list) or not items or len(items) > 20:
            raise ValidationError(
                "Provide `items`: a list of 1-20 {filename, content_type, product_id|category_id} objects."
            )
        results = []
        for item in items:
            if not isinstance(item, dict):
                raise ValidationError("Each item must be an object.")
            product_id = item.get("product_id")
            category_id = item.get("category_id")
            filename = str(item.get("filename") or "")
            content_type = str(item.get("content_type") or "").lower()
            if (product_id is None) == (category_id is None):
                raise ValidationError(
                    "Each item needs exactly one of product_id or category_id "
                    "(save the product or category first, then upload its image)."
                )
            if product_id is not None:
                if not isinstance(product_id, int):
                    raise ValidationError("product_id must be an integer.")
                if not Product.objects.filter(pk=product_id).exists():
                    raise ValidationError(f"Product {product_id} does not exist.")
                try:
                    signed = uploads.sign_product_image(product_id, filename, content_type)
                except ValueError as exc:
                    raise ValidationError(str(exc))
            else:
                if not isinstance(category_id, int):
                    raise ValidationError("category_id must be an integer.")
                if not Category.objects.filter(pk=category_id).exists():
                    raise ValidationError(f"Category {category_id} does not exist.")
                try:
                    signed = uploads.sign_category_image(category_id, filename, content_type)
                except ValueError as exc:
                    raise ValidationError(str(exc))
            # Local fallback URLs are relative (same origin); make them absolute
            # so the browser can PUT directly to whatever host signed them.
            if signed["upload_url"].startswith("/"):
                signed["upload_url"] = request.build_absolute_uri(signed["upload_url"])
            results.append(signed)
        return Response({"uploads": results})


class RawBodyParser(parsers.BaseParser):
    """Passes the request body through as raw bytes."""

    media_type = "*/*"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


class LocalUploadPutView(APIView):
    """
    PUT /api/admin-api/uploads/local/?key=…
    Receives the raw file bytes from the browser and stores them via the
    default media storage (Cloudinary when configured, local media otherwise).
    Staff-only, key must be one this API signed.
    """

    permission_classes = [IsStaff]
    parser_classes = [RawBodyParser]

    def put(self, request):
        key = request.query_params.get("key", "")
        if not uploads.key_is_wellformed(key):
            raise ValidationError("Invalid or unsigned key.")
        data = request.data if isinstance(request.data, (bytes, bytearray)) else b""
        if len(data) > uploads.MAX_DIRECT_UPLOAD_BYTES:
            raise ValidationError("File exceeds the 4MB direct-upload limit.")
        content_type = (request.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type not in uploads.ALLOWED_CONTENT_TYPES:
            raise ValidationError("Unsupported image type.")
        uploads.write_local(key, data, content_type)
        return Response({"detail": "Stored.", "key": key}, status=status.HTTP_200_OK)


class AdminProductImageViewSet(viewsets.ModelViewSet):
    """Upload, replace, reorder and delete a product's images.

    `variant` (id or null) links a photo to one variation so the storefront
    shows it when that option is selected; null makes it a general photo."""

    permission_classes = [IsStaff]
    serializer_class = s.AdminProductImageSerializer
    pagination_class = None

    def get_queryset(self):
        return ProductImage.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).order_by("display_order", "id")

    def _resolve_variant(self, product, image):
        """Validate request.data['variant'] (id or null) against the product."""
        if "variant" not in self.request.data:
            return "__absent__"
        variant_ref = self.request.data.get("variant")
        if variant_ref in (None, "", "null"):
            return None
        try:
            variant_ref = int(variant_ref)
        except (TypeError, ValueError):
            raise ValidationError("variant must be a variation id or null.")
        variant = ProductVariant.objects.filter(pk=variant_ref).first()
        if not variant or variant.product_id != product.pk:
            raise ValidationError("That variation does not belong to this product.")
        return variant

    def perform_create(self, serializer):
        product = Product.objects.filter(pk=self.kwargs["product_pk"]).first()
        if not product:
            raise ValidationError("Product not found.")
        variant = self._resolve_variant(product, None)
        start = (product.images.aggregate(m=Max("display_order"))["m"] or 0) + 1
        defaults = {"display_order": self.request.data.get("display_order", start)}
        if variant != "__absent__":
            defaults["variant"] = variant
        serializer.save(product=product, **defaults)

    def perform_update(self, serializer):
        variant = self._resolve_variant(serializer.instance.product, serializer.instance)
        if variant != "__absent__":
            serializer.save(variant=variant)
        else:
            serializer.save()

    @action(detail=False, methods=["post"])
    def reorder(self, request, product_pk=None):
        """POST {image_ids: [3, 1, 2]} — assigns display_order by position."""
        image_ids = request.data.get("image_ids") or []
        product = Product.objects.filter(pk=product_pk).first()
        if not product:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        valid = set(product.images.values_list("id", flat=True))
        if not set(image_ids).issubset(valid):
            return Response({"detail": "One or more images do not belong to this product."},
                            status=status.HTTP_400_BAD_REQUEST)
        for index, image_id in enumerate(image_ids):
            ProductImage.objects.filter(pk=image_id).update(display_order=index)
        return Response({"detail": "Image order updated."})


# ---------------------------------------------------------------------------
# Categories & brands
# ---------------------------------------------------------------------------
class AdminCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaff]
    serializer_class = s.AdminCategorySerializer
    queryset = Category.objects.all().annotate(product_count=Count("products"))
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["display_order", "name", "created_at"]
    ordering = ["display_order", "name"]

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.products.exists():
            return Response({"detail": "Move or delete the products in this category first."},
                            status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


class AdminBrandViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaff]
    serializer_class = s.AdminBrandSerializer
    queryset = Brand.objects.all().annotate(product_count=Count("products"))
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]


# ---------------------------------------------------------------------------
# Coupons
# ---------------------------------------------------------------------------
class AdminCouponViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaff]
    serializer_class = s.AdminCouponSerializer
    queryset = Coupon.objects.all()
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "code", "times_used"]
    ordering = ["-created_at"]


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

# Staff may move an order to any status within its fulfilment flow — forward
# or backward — except that cancelled, delivered and picked_up are final
# states that cannot be changed. This lets the admin undo a mistaken status
# change (e.g. move a shipped order back to ready_for_delivery) without being
# locked out.
BLOCKED_STATUSES = {OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.PICKED_UP}


class AdminOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET   /api/admin/orders/       ?status=&payment_status=&delivery_method=
                                     &tracking=true|false&search=&ordering=
    GET   /api/admin/orders/<id>/
    PATCH /api/admin/orders/<id>/status/     {status, note?}
    PATCH /api/admin/orders/<id>/tracking/   {carrier, tracking_number, mark_shipped?}
    PATCH /api/admin/orders/<id>/payment/    {payment_status, payment_reference?, note?}
    """
    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["order_number", "email", "phone", "first_name", "last_name", "tracking_number"]
    # NOTE: `is_refunded` is a model property, not a DB column — it cannot go
    # in filterset_fields. Refund filtering works through `payment_status=refunded`.
    filterset_fields = ["status", "payment_status", "delivery_method"]
    ordering_fields = ["created_at", "total", "status", "shipped_at", "delivered_at"]
    ordering = ["-created_at"]

    queryset = Order.objects.select_related("user", "coupon").prefetch_related(
        "items__product__images", "items__variant", "history"
    )

    def get_queryset(self):
        qs = super().get_queryset()
        # `tracking=true` lists parcels that have a courier reference, `false`
        # lists the fulfilment backlog — orders staff still have to ship.
        tracking = self.request.query_params.get("tracking")
        if tracking in ("true", "1"):
            qs = qs.exclude(tracking_number="")
        elif tracking in ("false", "0"):
            qs = qs.filter(tracking_number="")
        return qs

    def get_serializer_class(self):
        return s.AdminOrderDetailSerializer if self.action == "retrieve" else s.AdminOrderListSerializer

    @action(detail=True, methods=["patch", "post"])
    @transaction.atomic
    def status(self, request, pk=None):
        order = self.get_object()
        previous_status = order.status
        serializer = s.OrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]
        note = serializer.validated_data.get("note", "")

        if new_status == order.status:
            return Response({"detail": f"Order is already {order.get_status_display()}."})

        if order.status in BLOCKED_STATUSES:
            return Response(
                {"detail": f"Order is {order.get_status_display().lower()} — this is a final state and cannot be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delivery statuses and pickup statuses do not mix: a pickup order can
        # never be shipped, and a delivery order can never be collected.
        allowed = {s.value for s in status_flow(order.delivery_method)}
        if new_status != OrderStatus.CANCELLED and new_status not in allowed:
            kind = "store pickup" if order.delivery_method == DeliveryMethod.PICKUP else "delivery"
            label = dict(OrderStatus.choices).get(new_status, new_status)
            return Response(
                {"detail": f"'{label}' does not apply to a {kind} order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_status == OrderStatus.CANCELLED:
            if order.payment_status == PaymentStatus.PAID:
                return Response(
                    {"detail": "Paid orders cannot be cancelled — refund the customer first, "
                               "mark the payment as refunded, then cancel."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cancel_order(order, note=note or "Cancelled by store staff.")
        else:
            order.status = new_status
            touched = ["status", "updated_at"]
            if new_status == OrderStatus.SHIPPED and not order.shipped_at:
                order.shipped_at = timezone.now()
                touched.append("shipped_at")
            if new_status in (OrderStatus.DELIVERED, OrderStatus.PICKED_UP):
                # Either a doorstep handover or a counter handover completes
                # fulfilment; both record the moment on `delivered_at`.
                order.delivered_at = order.delivered_at or timezone.now()
                touched.append("delivered_at")
            order.save(update_fields=touched)
            order.add_history(new_status, note or f"Status set to {order.get_status_display()} by staff.")
            # Every customer-visible milestone notifies the customer (processing,
            # ready for delivery/pickup, shipped, delivered, picked up). The
            # event layer ignores transitions that are already covered
            # elsewhere (e.g. payment confirmation).
            send_order_status_email(order, previous_status)
        order = self.queryset.get(pk=order.pk)
        return Response(s.AdminOrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["patch", "post"])
    @transaction.atomic
    def tracking(self, request, pk=None):
        """Record the courier reference for a parcel, and optionally mark it shipped."""
        order = self.get_object()
        previous_status = order.status
        if order.delivery_method == DeliveryMethod.PICKUP:
            return Response(
                {"detail": "Store pickup orders are not shipped — advance them with the pickup statuses instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = s.OrderTrackingUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        for field in ("carrier", "tracking_number", "staff_note"):
            if field in data:
                setattr(order, field, data[field])

        mark_shipped = data.get("mark_shipped")
        if mark_shipped:
            if order.status not in (OrderStatus.READY_FOR_DELIVERY, OrderStatus.PROCESSING, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PLACED):
                return Response({"detail": "Only an order that is still in the warehouse can be marked shipped."},
                                status=status.HTTP_400_BAD_REQUEST)
            if not order.is_tracked:
                return Response({"detail": "Add a carrier and tracking number before marking the order shipped."},
                                status=status.HTTP_400_BAD_REQUEST)
            order.status = OrderStatus.SHIPPED
            order.shipped_at = order.shipped_at or timezone.now()
            order.add_history(OrderStatus.SHIPPED, "Parcel handed to the courier.")

        order.save()
        if mark_shipped:
            send_order_status_email(order, previous_status)
        order = self.queryset.get(pk=order.pk)
        return Response(s.AdminOrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["patch", "post"])
    @transaction.atomic
    def payment(self, request, pk=None):
        """Record a payment outcome — e.g. mark a support-processed refund.

        Money is moved outside the store (support refunds through the Paystack
        dashboard or by transfer); this endpoint only keeps the order's
        records in step.
        """
        order = self.get_object()
        serializer = s.PaymentStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_payment = serializer.validated_data["payment_status"]
        note = serializer.validated_data.get("note", "")

        if new_payment == PaymentStatus.PAID and order.payment_status == PaymentStatus.PAID:
            return Response({"detail": "Order is already marked as paid."})

        if new_payment == PaymentStatus.REFUNDED and order.payment_status == PaymentStatus.REFUNDED:
            return Response({"detail": "Order is already marked as refunded."})

        if new_payment == PaymentStatus.PAID:
            order, _ = mark_order_paid(
                order,
                serializer.validated_data.get("payment_reference") or order.payment_reference,
                note=note or "Payment confirmed by staff.",
            )
        else:
            order.payment_status = new_payment
            fields = ["payment_status", "updated_at"]
            if new_payment == PaymentStatus.REFUNDED and not order.refunded_at:
                order.refunded_at = timezone.now()
                fields.append("refunded_at")
            if serializer.validated_data.get("payment_reference"):
                order.payment_reference = serializer.validated_data["payment_reference"]
                fields.append("payment_reference")
            default_note = (
                "Payment marked as refunded by staff — refund handled outside the store."
                if new_payment == PaymentStatus.REFUNDED
                else f"Payment status set to '{new_payment}' by staff."
            )
            order.add_history(order.status, note or default_note)
            order.save(update_fields=fields)
            if new_payment == PaymentStatus.REFUNDED:
                send_order_refunded(
                    order,
                    amount=order.refund_amount or order.total,
                    reference=order.payment_reference,
                    is_partial=bool(order.refund_amount and order.refund_amount < order.total),
                    note=note or default_note,
                )
        order = self.queryset.get(pk=order.pk)
        return Response(s.AdminOrderDetailSerializer(order, context={"request": request}).data)


class AdminReceiptVerifyView(APIView):
    """
    GET /api/admin/receipts/verify/?order_number=&code=

    Staff-only receipt authenticity check. The code printed on a receipt is
    an HMAC over the order's own facts, so a doctored receipt never matches
    while every genuine receipt maps back to exactly one order.

    The response therefore identifies that order in full — who it belongs to,
    what it covers, and whether payment still stands. A receipt is unique:
    two people presenting the same one cannot both be its owner, and an old
    receipt cannot stand in for a newer purchase. Staff compare the person in
    front of them, and what they claim to have bought, against these details
    before accepting the receipt as proof.

    The first successful check of a paid receipt is ALSO recorded here — the
    one deliberate write on this GET: who checked it and when. Every later
    check keeps that first record and reports it back, so the same receipt
    cannot quietly pass as fresh proof twice. Receipts that are not proof of
    payment are never recorded.
    """

    permission_classes = [IsStaff]

    def get(self, request):
        number = (request.query_params.get("order_number") or "").strip().upper()
        code = (request.query_params.get("code") or "").strip()
        if not number or not code:
            raise ValidationError("Enter both the order number and the verification code from the receipt.")

        order = (
            Order.objects.prefetch_related("items")
            .filter(order_number__iexact=number)
            .first()
        )
        if not order or not code_matches(order, code):
            return Response({
                "valid": False,
                "detail": (
                    "This receipt does not verify — the code does not match the receipt we issued "
                    "for that order. It did not come from us: do not treat it as proof of purchase."
                ),
            })

        if order.is_paid:
            detail = f"Genuine receipt for {order.order_number}, issued to {order.customer_name} ({order.email})."
        else:
            detail = (
                f"The code is genuine, but this order's payment status is currently "
                f"'{order.get_payment_status_display()}' — it is not proof that payment stands."
            )

        # A genuine, paid receipt is "used up" by its first successful check:
        # record who verified it and when, exactly once. The filtered UPDATE is
        # a compare-and-set, so even two simultaneous checks record ONE
        # verification — the other check reports the winner's record instead.
        if order.is_paid:
            recorded = (
                Order.objects.filter(pk=order.pk, receipt_verified_at__isnull=True).update(
                    receipt_verified_at=timezone.now(),
                    receipt_verified_by=request.user,
                )
                == 1
            )
            order.refresh_from_db()
        else:
            recorded = False

        verifier = order.receipt_verified_by
        return Response({
            "valid": True,
            "detail": detail,
            # True only when the receipt was checked successfully before — this
            # check did not do the recording.
            "already_verified": order.receipt_verified_at is not None and not recorded,
            # True when this very check is the one that recorded the verification.
            "recorded": recorded,
            "verified_at": order.receipt_verified_at,
            "verified_by": (verifier.full_name or verifier.email) if verifier else None,
            "order": {
                "order_number": order.order_number,
                "created_at": order.created_at,
                "status": order.status,
                "status_display": order.get_status_display(),
                "payment_status": order.payment_status,
                "payment_status_display": order.get_payment_status_display(),
                "is_paid": order.is_paid,
                "total": str(order.total),
                "paid_at": order.paid_at,
                "payment_reference": order.payment_reference,
                "customer_name": order.customer_name,
                "email": order.email,
                "phone": order.phone,
                "items": [
                    {
                        "product_name": item.product_name,
                        "product_sku": item.product_sku,
                        "variant_label": item.variant_label,
                        "quantity": item.quantity,
                        "unit_price": str(item.unit_price),
                        "total_price": str(item.total_price),
                    }
                    for item in order.items.all()
                ],
                "refund_amount": str(order.refund_amount) if order.refund_amount is not None else None,
                "refund_reason": order.refund_reason,
                "refunded_at": order.refunded_at,
            },
        })


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
class AdminCustomerViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET   /api/admin/customers/    ?search=<name/email/phone>&is_active=&is_staff=&is_superuser=&ordering=
    GET   /api/admin/customers/<id>/
    PATCH /api/admin/customers/<id>/            edit basic details
    POST  /api/admin/customers/<id>/set_active/ {is_active}
    POST  /api/admin/customers/<id>/set_staff/  {is_staff}

    Roles are a ladder: customers < admins (`is_staff`) < superusers. Any panel
    user — admin or superuser — can promote customers, revoke an admin, or
    block/unblock a customer or fellow admin. Two accounts are out of bounds
    for everyone: superuser accounts, and your own (no self-lockout).
    """
    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["email", "first_name", "last_name", "phone"]
    filterset_fields = ["is_active", "is_staff", "is_superuser", "email_verified"]
    ordering_fields = ["date_joined", "email", "total_spent", "order_count"]
    ordering = ["-date_joined"]
    # `post` is required by the set_active/set_staff @action endpoints.
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    def get_queryset(self):
        # Everyone is listed here — customers AND admins — so the team can see
        # (and the owner can audit) exactly who has admin access. Writes to
        # superuser accounts stay blocked by the guards in _toggle/set_staff.
        spent = Sum("orders__total", output_field=DecimalField())
        return (
            User.objects.all()
            .annotate(order_count=Count("orders", distinct=True),
                      total_spent=Coalesce(spent, 0, output_field=DecimalField()))
        )

    def get_serializer_class(self):
        if self.action == "list":
            return s.AdminCustomerListSerializer
        if self.action in ("update", "partial_update"):
            return s.AdminCustomerUpdateSerializer
        return s.AdminCustomerDetailSerializer

    def _toggle(self, request, field):
        user = self.get_object()
        value = bool(request.data.get(field, not getattr(user, field)))
        # Never let a panel user lock themselves out mid-session, which would
        # leave them no way back in through this API.
        if user.pk == request.user.pk and not value:
            return Response({"detail": "You cannot deactivate your own account."},
                            status=status.HTTP_400_BAD_REQUEST)
        if user.is_superuser:
            return Response({"detail": "Superuser accounts cannot be changed from the admin panel."},
                            status=status.HTTP_400_BAD_REQUEST)
        setattr(user, field, value)
        user.save(update_fields=[field])
        label = f"{user.email} is now {'active' if value else 'blocked'}."
        return Response({"detail": label})

    @action(detail=True, methods=["post"])
    def set_active(self, request, pk=None):
        return self._toggle(request, "is_active")

    @action(detail=True, methods=["post"])
    def set_staff(self, request, pk=None):
        """Promote/demote an admin (`is_staff`) — any panel user may do this.

        Promotion grants admin access, never superuser: superuser accounts can
        be added from the server only and are never modifiable through this
        API, so no admin can ever take the owner's place.
        """
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response({"detail": "You cannot change your own admin status."},
                            status=status.HTTP_400_BAD_REQUEST)
        if user.is_superuser:
            return Response({"detail": "Superuser accounts cannot be changed from the admin panel."},
                            status=status.HTTP_400_BAD_REQUEST)
        if "is_staff" not in request.data:
            return Response({"detail": "Provide is_staff: true to grant admin access, false to revoke it."},
                            status=status.HTTP_400_BAD_REQUEST)
        value = bool(request.data.get("is_staff", False))
        user.is_staff = value
        user.save(update_fields=["is_staff"])
        label = "an admin" if value else "a customer"
        return Response({"detail": f"{user.email} is now {label}.", "is_staff": value})


# ---------------------------------------------------------------------------
# Reviews & messages
# ---------------------------------------------------------------------------
class AdminReviewViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/admin/reviews/    ?is_approved=&rating=&ordering=
    PATCH  /api/admin/reviews/<id>/approve/  {is_approved}
    DELETE /api/admin/reviews/<id>/
    """
    permission_classes = [IsStaff]
    serializer_class = s.AdminReviewSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["comment", "title"]
    filterset_fields = ["is_approved", "rating", "is_verified_purchase"]
    ordering_fields = ["created_at", "rating"]
    ordering = ["-created_at"]
    queryset = Review.objects.select_related("user", "product").all()

    @action(detail=True, methods=["patch", "post"])
    def approve(self, request, pk=None):
        review = self.get_object()
        review.is_approved = bool(request.data.get("is_approved", not review.is_approved))
        review.save(update_fields=["is_approved"])
        return Response(self.get_serializer(review).data)


class AdminMessageViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/admin/messages/   ?is_resolved=&ordering=
    POST   /api/admin/messages/<id>/resolve/  {is_resolved}
    DELETE /api/admin/messages/<id>/   (resolved messages only)

    Deleting is purposefully one-way and restricted to resolved messages:
    staff clear handled enquiries out of the inbox, but nothing unhandled
    can disappear — the check lives here, not only in the button.
    """
    permission_classes = [IsStaff]
    serializer_class = s.AdminMessageSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["is_resolved"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
    queryset = ContactMessage.objects.all()

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        message = self.get_object()
        message.is_resolved = bool(request.data.get("is_resolved", not message.is_resolved))
        message.save(update_fields=["is_resolved"])
        return Response(self.get_serializer(message).data)

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()
        if not message.is_resolved:
            return Response(
                {"detail": "Only resolved messages can be deleted — resolve it first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        message.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
class AdminStatsView(APIView):
    """GET /api/admin/stats/ — headline numbers for the admin dashboard."""

    permission_classes = [IsStaff]

    def get(self, request):
        now = timezone.now()
        today = now.date()
        month_start = today.replace(day=1)
        # Read the threshold from settings so this card always agrees with the
        # "Low Stock" badge on the product and with Django admin.
        low_threshold = getattr(settings, "LOW_STOCK_THRESHOLD", 5)

        orders = Order.objects.all()
        products = Product.objects.all()
        paid_orders = orders.filter(payment_status=PaymentStatus.PAID)

        revenue_month = paid_orders.filter(created_at__gte=month_start).aggregate(t=Sum("total"))["t"]
        revenue_today = paid_orders.filter(created_at__date=today).aggregate(t=Sum("total"))["t"]

        status_counts = dict(orders.values_list("status").annotate(c=Count("id")))

        top_products = (
            paid_orders.filter(items__product__isnull=False)
            .values("items__product__id", "items__product__name", "items__product__slug")
            .annotate(units=Sum("items__quantity"), revenue=Sum("items__total_price"))
            .order_by("-units")[:5]
        )
        recent_orders = orders.order_by("-created_at")[:8]

        # The handful of items most at risk of running out, so staff can
        # reorder without hunting through the catalogue. Match the Low Stock
        # badge exactly: at or under the threshold, but not yet zero.
        low_stock_items = (
            products.filter(is_active=True, stock_quantity__lte=low_threshold)
            .exclude(stock_quantity=0)
            .order_by("stock_quantity")
            .values("id", "name", "slug", "stock_quantity", "price")[:8]
        )

        # Fulfilment split: which parcels already have a courier reference and
        # which are still sitting in the warehouse waiting to be shipped.
        shipped_or_tracked = orders.exclude(tracking_number="").count()

        return Response({
            "customers": {
                "total": User.objects.filter(is_superuser=False).count(),
                "active": User.objects.filter(is_superuser=False, is_active=True).count(),
                "new_this_month": User.objects.filter(is_superuser=False, date_joined__gte=month_start).count(),
                "staff": User.objects.filter(is_staff=True, is_superuser=False).count(),
            },
            "products": {
                "total": products.count(),
                "active": products.filter(is_active=True).count(),
                "archived": products.filter(is_active=False).count(),
                "low_stock": products.filter(is_active=True, stock_quantity__lte=low_threshold)
                .exclude(availability=Availability.OUT_OF_STOCK)
                .count(),
                "out_of_stock": products.filter(is_active=True, availability=Availability.OUT_OF_STOCK).count(),
                "low_stock_threshold": low_threshold,
                "low_stock_items": list(low_stock_items),
            },
            "orders": {
                "total": orders.count(),
                "pending": orders.filter(status__in=[OrderStatus.PLACED, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PROCESSING]).count(),
                "ready_to_ship": orders.filter(status=OrderStatus.READY_FOR_DELIVERY).count(),
                "ready_for_pickup": orders.filter(status=OrderStatus.READY_FOR_PICKUP).count(),
                "awaiting_payment": orders.filter(payment_status=PaymentStatus.PENDING).count(),
                "paid": orders.filter(payment_status=PaymentStatus.PAID).count(),
                "delivered": orders.filter(status=OrderStatus.DELIVERED).count(),
                "cancelled": orders.filter(status=OrderStatus.CANCELLED).count(),
                "refunded": orders.filter(payment_status=PaymentStatus.REFUNDED).count(),
                "tracked": shipped_or_tracked,
                "untracked": orders.filter(tracking_number="").count(),
                "status_counts": status_counts,
            },
            "revenue": {
                "today": revenue_today or 0,
                "this_month": revenue_month or 0,
                "average_order": (paid_orders.aggregate(t=Sum("total"))["t"] or 0) / (paid_orders.count() or 1),
            },
            "reviews_pending": Review.objects.filter(is_approved=False).count(),
            "messages_unresolved": ContactMessage.objects.filter(is_resolved=False).count(),
            "top_products": list(top_products),
            "recent_orders": s.AdminOrderListSerializer(recent_orders, many=True, context={"request": request}).data,
        })


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
class AdminReportsView(APIView):
    """GET /api/admin-api/reports/?days=30

    Sales performance over a window: revenue trend, best sellers, best
    customers, coupon performance and where orders are stuck in fulfilment.
    """

    permission_classes = [IsStaff]

    def get(self, request):
        try:
            days = max(1, min(int(request.query_params.get("days", 30)), 365))
        except (TypeError, ValueError):
            raise ValidationError("`days` must be a whole number between 1 and 365.")

        since = timezone.now() - timedelta(days=days)
        paid = Order.objects.filter(payment_status=PaymentStatus.PAID, created_at__gte=since)
        window = Order.objects.filter(created_at__gte=since)

        # One bucket per day, zero-filled, so the chart has no gaps.
        # After .values("d").annotate(...) each row is keyed by the truncated
        # date (`d`) plus the aggregate — TruncDate rows are date objects.
        revenue_by_day = {
            row["d"].isoformat(): row["total"]
            for row in paid.annotate(d=TruncDate("created_at"))
            .values("d")
            .annotate(total=Sum("total"))
        }
        orders_by_day = {
            row["d"].isoformat(): row["c"]
            for row in window.annotate(d=TruncDate("created_at")).values("d").annotate(c=Count("id"))
        }
        today = timezone.localdate()
        series = []
        for offset in range(days - 1, -1, -1):
            day = (today - timedelta(days=offset)).isoformat()
            series.append({
                "date": day,
                "revenue": float(revenue_by_day.get(day) or 0),
                "orders": orders_by_day.get(day, 0),
            })

        best_sellers = (
            paid.filter(items__product__isnull=False)
            .values("items__product__id", "items__product__name", "items__product__slug")
            .annotate(units=Sum("items__quantity"), revenue=Sum("items__total_price"))
            .order_by("-units")[:10]
        )

        best_customers = (
            paid.values("user_id", "email", "first_name", "last_name")
            .annotate(orders=Count("id", distinct=True), spend=Sum("total"))
            .order_by("-spend")[:10]
        )

        coupon_performance = (
            Order.objects.filter(created_at__gte=since, coupon_code__gt="")
            .values("coupon_code")
            .annotate(orders=Count("id"), revenue=Sum("total"), discount=Sum("discount"))
            .order_by("-orders")[:10]
        )

        return Response({
            "days": days,
            "since": since,
            "totals": {
                "revenue": float(paid.aggregate(t=Sum("total"))["t"] or 0),
                "orders": window.count(),
                "paid_orders": paid.count(),
                "average_order": float(paid.aggregate(t=Sum("total"))["t"] or 0) / (paid.count() or 1),
                "units": sum(i.quantity for i in OrderItem.objects.filter(order__in=paid)),
                "discount_given": float(window.aggregate(d=Sum("discount"))["d"] or 0),
            },
            "by_status": dict(window.values_list("status").annotate(c=Count("id"))),
            "by_payment": dict(window.values_list("payment_status").annotate(c=Count("id"))),
            "by_delivery_method": dict(window.values_list("delivery_method").annotate(c=Count("id"))),
            "series": series,
            "best_sellers": list(best_sellers),
            "best_customers": list(best_customers),
            "coupon_performance": list(coupon_performance),
        })



