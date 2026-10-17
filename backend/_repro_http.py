"""Make real HTTP calls against the running dev server, browser-style."""
import os
import urllib.request
import urllib.error
import urllib.parse

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from rest_framework_simplejwt.tokens import AccessToken  # noqa: E402

# User 16 is the superuser in this dev database.
token = str(AccessToken.for_user(type("U", (), {"id": 16, "pk": 16, "is_active": True})()))

BASE = "http://localhost:8000/api/admin-api/customers/"
cases = [
    {"page": "1", "page_size": "25"},
    {"page": "1", "page_size": "25", "is_staff": "true"},
    {"page": "1", "page_size": "25", "is_staff": "false"},
]

for params in cases:
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Origin", "http://localhost:5173")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read(300).decode("utf-8", "replace")
            print(f"{url} -> {resp.status}")
            print("  CORS:", resp.headers.get("Access-Control-Allow-Origin"))
            print("  BODY:", body[:240])
    except urllib.error.HTTPError as e:
        print(f"{url} -> HTTP {e.code}")
        print("  CORS:", e.headers.get("Access-Control-Allow-Origin"))
        print("  BODY:", e.read(300).decode("utf-8", "replace"))
    except Exception as e:
        print(f"{url} -> EXCEPTION {type(e).__name__}: {e}")
    print("-" * 70)
