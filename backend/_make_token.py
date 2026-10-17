"""Print a short-lived access+refresh token pair for dev user 16 (superuser)."""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from rest_framework_simplejwt.tokens import AccessToken  # noqa: E402


class FakeUser:
    id = 16
    pk = 16
    is_active = True


# AccessToken.for_user only signs claims — no OutstandingToken rows needed.
with open("_dev_access.txt", "w", encoding="utf-8") as fh:
    fh.write(str(AccessToken.for_user(FakeUser())))
print("wrote _dev_access.txt")
