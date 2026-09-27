from django.urls import path

from . import views

urlpatterns = [
    path("", views.CartView.as_view(), name="cart"),
    path("items/", views.CartItemsView.as_view(), name="cart-items"),
    path("items/<int:pk>/", views.CartItemDetailView.as_view(), name="cart-item-detail"),
    path("merge/", views.MergeCartView.as_view(), name="cart-merge"),
    path("quote/", views.CartQuoteView.as_view(), name="cart-quote"),
]
