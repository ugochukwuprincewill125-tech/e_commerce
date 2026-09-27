from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import OrderViewSet, TrackOrderView

router = DefaultRouter()
router.register("", OrderViewSet, basename="order")

urlpatterns = [
    path("track/", TrackOrderView.as_view(), name="order-track"),
] + router.urls
