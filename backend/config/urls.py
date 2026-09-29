from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Timeline Global Systems — Administration"
admin.site.site_title = "Timeline Admin"
admin.site.index_title = "Store management"

api_patterns = [
    path("", include("apps.core.urls")),
    path("auth/", include("apps.users.auth_urls")),
    path("users/", include("apps.users.urls")),
    path("categories/", include("apps.categories.urls")),
    path("brands/", include("apps.brands.urls")),
    path("products/", include("apps.products.urls")),
    path("search/", include("apps.products.search_urls")),
    path("cart/", include("apps.cart.urls")),
    path("wishlist/", include("apps.wishlist.urls")),
    path("orders/", include("apps.orders.urls")),
    path("payments/", include("apps.payments.urls")),
    path("reviews/", include("apps.reviews.urls")),
    path("coupons/", include("apps.promotions.urls")),
    path("admin-api/", include("apps.admin_api.urls")),
]

urlpatterns = [
    # Non-obvious path (see ADMIN_URL in settings) — bots probing /admin/ hit 404.
    path(settings.ADMIN_URL, admin.site.urls),
    path("api/", include(api_patterns)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
