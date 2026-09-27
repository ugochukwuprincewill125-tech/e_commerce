from django.urls import path

from . import views

urlpatterns = [
    path("", views.WishlistView.as_view(), name="wishlist"),
    path("<int:product_id>/", views.WishlistItemView.as_view(), name="wishlist-item"),
    path("<int:product_id>/move-to-cart/", views.MoveToCartView.as_view(), name="wishlist-move-to-cart"),
]
