"""
Vercel serverless entry point for the Django backend.

The whole project deploys as ONE Vercel project:
  - `frontend/dist` is served as static files by Vercel's CDN
  - this function handles /api/*, /static/* and the Django admin path

Vercel runs whatever `app` (WSGI) it finds here, so we point Django at the
production settings and put `backend/` on sys.path.
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

from django.core.wsgi import get_wsgi_application  # noqa: E402

app = get_wsgi_application()
