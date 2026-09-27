from django.urls import path

from .views import ApplyCouponView

urlpatterns = [
    path("apply/", ApplyCouponView.as_view(), name="coupon-apply"),
]
