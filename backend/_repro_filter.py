"""One-off repro: exercise the admin customers list the way the frontend does."""
import os
import traceback

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.admin_api.views import AdminCustomerViewSet  # noqa: E402
from apps.users.models import User  # noqa: E402

factory = APIRequestFactory()
# Unsaved stand-in so permission checks pass without writing to the database.
fake = User(email="repro@example.com", is_staff=True, is_superuser=True, is_active=True)

cases = [
    {},
    {"is_staff": "true"},
    {"is_staff": "false"},
    {"is_staff": "false", "page": "1", "page_size": "25"},
    {"email_verified": "true"},
    {"is_active": "true"},
    {"search": "a"},
]

for params in cases:
    view = AdminCustomerViewSet.as_view({"get": "list"})
    request = factory.get("/api/admin-api/customers/", params)
    force_authenticate(request, user=fake)
    try:
        response = view(request)
        if hasattr(response, "render"):
            response.render()
        body = response.content[:400].decode("utf-8", "replace")
        print(f"PARAMS {params} -> {response.status_code}")
        print(f"  BODY {body!r}")
    except Exception:
        print(f"PARAMS {params} -> EXCEPTION")
        traceback.print_exc()
    print("-" * 70)
