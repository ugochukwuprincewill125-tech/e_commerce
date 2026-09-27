from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("addresses", views.AddressViewSet, basename="address")

urlpatterns = [
    path("profile/", views.ProfileView.as_view(), name="user-profile"),
    path("dashboard/", views.DashboardView.as_view(), name="user-dashboard"),
] + router.urls
