from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import OrderViewSet, ProcessUnpaidOrdersView, ReleaseUnpaidOrdersView

router = DefaultRouter()
router.register("", OrderViewSet, basename="order")

urlpatterns = [
    path("maintenance/release-unpaid/", ReleaseUnpaidOrdersView.as_view(), name="orders-release-unpaid"),
    path("maintenance/process-unpaid/", ProcessUnpaidOrdersView.as_view(), name="orders-process-unpaid"),
] + router.urls
