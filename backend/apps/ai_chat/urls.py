from django.urls import path

from .views import ChatProxyView, HealthView

urlpatterns = [
    path("chat/", ChatProxyView.as_view(), name="chat"),
    path("health/", HealthView.as_view(), name="health"),
]
