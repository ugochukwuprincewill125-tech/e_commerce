"""URL patterns for the staff-only admin API (mounted at /api/admin/)."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("products", views.AdminProductViewSet, basename="admin-product")
router.register("products/(?P<product_pk>[^/.]+)/images", views.AdminProductImageViewSet, basename="admin-product-image")
router.register("categories", views.AdminCategoryViewSet, basename="admin-category")
router.register("brands", views.AdminBrandViewSet, basename="admin-brand")
router.register("coupons", views.AdminCouponViewSet, basename="admin-coupon")
router.register("orders", views.AdminOrderViewSet, basename="admin-order")
router.register("customers", views.AdminCustomerViewSet, basename="admin-customer")
router.register("reviews", views.AdminReviewViewSet, basename="admin-review")
router.register("messages", views.AdminMessageViewSet, basename="admin-message")

urlpatterns = [
    path("stats/", views.AdminStatsView.as_view(), name="admin-stats"),
] + router.urls
