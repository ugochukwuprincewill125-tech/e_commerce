from django.urls import path

from .views import ContactView, HealthView, StoreInfoView

urlpatterns = [
    path("store-info/", StoreInfoView.as_view(), name="store-info"),
    path("contact/", ContactView.as_view(), name="contact"),
    path("health/", HealthView.as_view(), name="health"),
]
