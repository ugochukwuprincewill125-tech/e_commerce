"""Development settings."""
from .base import *  # noqa: F401,F403
from .base import env_bool

DEBUG = env_bool("DEBUG", True)

if not SECRET_KEY:  # noqa: F405
    # Development-only fallback so the project runs out of the box.
    # Production refuses to start without a real SECRET_KEY (see prod.py).
    SECRET_KEY = "dev-only-insecure-key-change-me"

# Keep throttling generous while developing.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].update({"anon": "1000/min", "user": "2000/min"})  # noqa: F405
