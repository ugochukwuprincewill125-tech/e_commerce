"""Staff-only REST API for managing the Timeline store.

Every view requires an authenticated user with `is_staff=True`. The admin
frontend sends `Authorization: Bearer <access>` just like the customer API.
"""
import json

import django_filters
from django.db import transaction
from django.db.models import Count, DecimalField, Max, Prefetch, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.core.models import ContactMessage
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services import cancel_order, mark_order_paid, restore_stock
from apps.products.filters import CharInFilter, search_q
from apps.products.models import Availability, Product, ProductImage, ProductVariant
from apps.promotions.models import Coupon
from apps.reviews.models import Review
from apps.users.models import User

from . import serializers as s


class IsStaff(permissions.IsAdminUser):
    """Explicit alias so the permission intent is obvious in every view."""

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

    class Meta:
        model = Product
        fields = []

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


def _save_product_children(product, images=None, variants=None):
    """Apply image/variant writes after the product row is saved.

    images:   [{"id": 4, "alt_text": "…", "display_order": 1}, …] — metadata
              updates for existing rows (file uploads are handled separately).
    variants: the FULL desired variant list; existing rows missing from it are
              deactivated rather than deleted so past orders stay intact.
    """
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
                variant = ProductVariant.objects.create(product=product, **payload)
            desired.append(variant.pk)
        product.variants.exclude(pk__in=desired).update(is_active=False)

    if images:
        for payload in images:
            image_id = payload.get("id")
            if image_id:
                ProductImage.objects.filter(product=product, pk=image_id).update(
                    alt_text=payload.get("alt_text", ""),
                    display_order=payload.get("display_order", 0),
                )
            else:
                raise ValidationError("Only existing images can be updated here; upload new ones via images[].")


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

    def _handle_uploads(self, product):
        """Create ProductImage rows from the multipart `images` file field.
        Accepts both `images` and `images[]` field names (axios vs jQuery style)."""
        files = self.request.FILES.getlist("images") or self.request.FILES.getlist("images[]")
        if not files:
            return
        try:
            alt_texts = self._parse_json_list("image_alt_texts") or []
        except ValidationError:
            alt_texts = []
        start = (product.images.aggregate(m=Max("display_order"))["m"] or 0) + 1
        ProductImage.objects.bulk_create([
            ProductImage(
                product=product, image=file,
                alt_text=alt_texts[i] if i < len(alt_texts) else "",
                display_order=start + i,
            )
            for i, file in enumerate(files)
        ])

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        self._handle_uploads(product)
        _save_product_children(product, variants=self._parse_json_list("variants"))
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
        self._handle_uploads(product)
        _save_product_children(
            product,
            images=self._parse_json_list("images"),
            variants=self._parse_json_list("variants"),
        )
        product = self.queryset.get(pk=product.pk)  # fresh copy, relations not stale
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
    def set_featured(self, request, pk=None):
        product = self.get_object()
        product.featured = bool(request.data.get("featured", not product.featured))
        product.save(update_fields=["featured", "updated_at"])
        return Response({"detail": f"{product.name}: featured={product.featured}"})


class AdminProductImageViewSet(viewsets.ModelViewSet):
    """Upload, replace, reorder and delete a product's images."""

    permission_classes = [IsStaff]
    serializer_class = s.AdminProductImageSerializer
    pagination_class = None

    def get_queryset(self):
        return ProductImage.objects.filter(product_id=self.kwargs["product_pk"]).order_by("display_order", "id")

    def perform_create(self, serializer):
        product = Product.objects.filter(pk=self.kwargs["product_pk"]).first()
        if not product:
            raise ValidationError("Product not found.")
        start = (product.images.aggregate(m=Max("display_order"))["m"] or 0) + 1
        serializer.save(product=product, display_order=self.request.data.get("display_order", start))

    @action(detail=True, methods=["post"])
    def reorder(self, request, product_pk=None, pk=None):
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
class AdminOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET   /api/admin/orders/       ?status=&payment_status=&delivery_method=&ordering=
    GET   /api/admin/orders/<id>/
    PATCH /api/admin/orders/<id>/status/     {status, note?}
    PATCH /api/admin/orders/<id>/payment/    {payment_status, payment_reference?, note?}
    """
    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "payment_status", "delivery_method"]
    ordering_fields = ["created_at", "total", "status"]
    ordering = ["-created_at"]

    queryset = Order.objects.select_related("user", "coupon").prefetch_related(
        "items__product__images", "items__variant", "history"
    )

    def get_serializer_class(self):
        return s.AdminOrderDetailSerializer if self.action == "retrieve" else s.AdminOrderListSerializer

    @action(detail=True, methods=["patch", "post"])
    @transaction.atomic
    def status(self, request, pk=None):
        order = self.get_object()
        serializer = s.OrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]
        note = serializer.validated_data.get("note", "")

        if new_status == order.status:
            return Response({"detail": f"Order is already {order.get_status_display()}."})

        if new_status == OrderStatus.CANCELLED:
            if order.payment_status == PaymentStatus.PAID:
                return Response({"detail": "Paid orders cannot be cancelled — refund them instead."},
                                status=status.HTTP_400_BAD_REQUEST)
            cancel_order(order, note=note or "Cancelled by store staff.")
        else:
            order.status = new_status
            order.save(update_fields=["status", "updated_at"])
            order.add_history(new_status, note or f"Status set to {order.get_status_display()} by staff.")
        order = self.queryset.get(pk=order.pk)
        return Response(s.AdminOrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["patch", "post"])
    @transaction.atomic
    def payment(self, request, pk=None):
        """Record a payment outcome. `refunded` also returns reserved stock."""
        order = self.get_object()
        serializer = s.PaymentStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_payment = serializer.validated_data["payment_status"]
        note = serializer.validated_data.get("note", "")

        if new_payment == PaymentStatus.PAID and order.payment_status == PaymentStatus.PAID:
            return Response({"detail": "Order is already marked as paid."})

        if new_payment == PaymentStatus.PAID:
            order, _ = mark_order_paid(
                order,
                serializer.validated_data.get("payment_reference") or order.payment_reference,
                note=note or "Payment confirmed by staff.",
            )
        else:
            order.payment_status = new_payment
            fields = ["payment_status", "updated_at"]
            if serializer.validated_data.get("payment_reference"):
                order.payment_reference = serializer.validated_data["payment_reference"]
                fields.append("payment_reference")
            if new_payment == PaymentStatus.REFUNDED and not order.stock_restored:
                restore_stock(order)
                order.add_history(order.status, note or "Stock returned to inventory after refund.")
            elif note:
                order.add_history(order.status, note)
            order.save(update_fields=fields)
        order = self.queryset.get(pk=order.pk)
        return Response(s.AdminOrderDetailSerializer(order, context={"request": request}).data)


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
class AdminCustomerViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET   /api/admin/customers/    ?search=<name/email/phone>&is_active=&ordering=
    GET   /api/admin/customers/<id>/
    PATCH /api/admin/customers/<id>/            edit basic details
    POST  /api/admin/customers/<id>/set_active/ {is_active}
    POST  /api/admin/customers/<id>/set_staff/  {is_staff}
    """
    permission_classes = [IsStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["is_active", "is_staff", "email_verified"]
    ordering_fields = ["date_joined", "email", "total_spent", "order_count"]
    ordering = ["-date_joined"]

    def get_queryset(self):
        spent = Sum("orders__total", output_field=DecimalField())
        return (
            User.objects.filter(is_superuser=False)
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
        if user.is_superuser:
            return Response({"detail": "Superusers cannot be modified from the API."},
                            status=status.HTTP_400_BAD_REQUEST)
        value = bool(request.data.get(field, not getattr(user, field)))
        setattr(user, field, value)
        user.save(update_fields=[field])
        return Response({"detail": f"{user.email}: {field}={value}"})

    @action(detail=True, methods=["post"])
    def set_active(self, request, pk=None):
        return self._toggle(request, "is_active")

    @action(detail=True, methods=["post"])
    def set_staff(self, request, pk=None):
        return self._toggle(request, "is_staff")


# ---------------------------------------------------------------------------
# Reviews & messages
# ---------------------------------------------------------------------------
class AdminReviewViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET    /api/admin/reviews/    ?is_approved=&rating=&ordering=
    PATCH  /api/admin/reviews/<id>/approve/  {is_approved}
    DELETE /api/admin/reviews/<id>/
    """
    permission_classes = [IsStaff]
    serializer_class = s.AdminReviewSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
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


class AdminMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/admin/messages/   ?is_resolved=&ordering=
    POST /api/admin/messages/<id>/resolve/  {is_resolved}
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

        return Response({
            "customers": User.objects.filter(is_superuser=False).count(),
            "products": {
                "total": products.count(),
                "active": products.filter(is_active=True).count(),
                "low_stock": products.filter(is_active=True, stock_quantity__lte=5).exclude(availability=Availability.OUT_OF_STOCK).count(),
                "out_of_stock": products.filter(is_active=True, availability=Availability.OUT_OF_STOCK).count(),
            },
            "orders": {
                "total": orders.count(),
                "pending": orders.filter(status__in=[OrderStatus.PLACED, OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PROCESSING]).count(),
                "awaiting_payment": orders.filter(payment_status=PaymentStatus.PENDING).count(),
                "status_counts": status_counts,
            },
            "revenue": {"today": revenue_today or 0, "this_month": revenue_month or 0},
            "reviews_pending": Review.objects.filter(is_approved=False).count(),
            "messages_unresolved": ContactMessage.objects.filter(is_resolved=False).count(),
            "top_products": list(top_products),
            "recent_orders": s.AdminOrderListSerializer(recent_orders, many=True, context={"request": request}).data,
        })
