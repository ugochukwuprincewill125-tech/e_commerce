from django.urls import path

from .views import SearchSuggestionsView

urlpatterns = [
    path("suggestions/", SearchSuggestionsView.as_view(), name="search-suggestions"),
]
