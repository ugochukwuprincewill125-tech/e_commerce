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

# Close database connections after every request in development.
#
# The Django dev server is threaded and browser keep-alive sockets keep those
# threads alive, so with a connection lifetime (CONN_MAX_AGE) each thread
# parks a pooled connection open. Supabase's session pooler allows only 15
# clients, and a few leftover `runserver` processes on one machine are enough
# to exhaust it — after that every request 500s with
# "max clients reached in session mode". Dev doesn't need connection reuse.
DATABASES["default"]["CONN_MAX_AGE"] = 0  # noqa: F405
