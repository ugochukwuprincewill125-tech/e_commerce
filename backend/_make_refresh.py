"""Mint a refresh token for dev user 16 and save it for the browser test."""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from rest_framework_simplejwt.tokens import RefreshToken  # noqa: E402

from apps.users.models import User  # noqa: E402

user = User.objects.get(pk=16)
token = RefreshToken.for_user(user)  # registers one OutstandingToken row, as a login would
with open("_dev_refresh.txt", "w", encoding="utf-8") as fh:
    fh.write(str(token))
print("wrote _dev_refresh.txt")
