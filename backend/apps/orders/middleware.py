"""Best-effort in-process triggers for the unpaid-order follow-up sweep.

GitHub's scheduled workflows can be delayed for hours. Render's free tier has
no cron and sleeps after a period of inactivity, but whenever the API is awake
we can keep the reminder/deletion timing close to the configured windows
without waiting for the next external workflow run.

The sweep is idempotent and runs in a short-lived daemon thread, so a customer
request never waits for Paystack or email delivery. The token-guarded
maintenance endpoint remains the authoritative external trigger; this is a
second, opportunistic trigger for the common case where the service is awake.
"""
import logging
import threading
import time

from django.conf import settings
from django.db import close_old_connections

logger = logging.getLogger(__name__)

# Only one sweep at a time in this process. The database-level locks and
# outbox idempotency keys make concurrent sweeps from extra processes safe too.
_sweep_lock = threading.Lock()
_last_sweep_started = 0.0
_MIN_INTERVAL_SECONDS = 60.0


def _run_sweep():
    global _last_sweep_started
    try:
        # Threads get their own Django database connection. Close stale ones so
        # a long-lived Render instance never keeps a dead Supabase connection.
        close_old_connections()
        from .services import process_unpaid_order_followups

        result = process_unpaid_order_followups()
        if any(result.values()):
            logger.info("Opportunistic unpaid-order sweep finished: %s", result)
        else:
            logger.debug("Opportunistic unpaid-order sweep finished: no work due.")
    except Exception:
        logger.exception("Opportunistic unpaid-order sweep failed; will retry on a later request.")
    finally:
        close_old_connections()
        _last_sweep_started = time.monotonic()
        _sweep_lock.release()


class UnpaidOrderSweepMiddleware:
    """Start the follow-up sweep at most once a minute, without blocking a request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        self._maybe_start_sweep(request)
        return self.get_response(request)

    @staticmethod
    def _maybe_start_sweep(request):
        global _last_sweep_started
        if not getattr(settings, "UNPAID_ORDER_SWEEP_ON_REQUEST", False):
            return
        # The endpoint trigger already runs a full sweep; do not launch a
        # second one just because the middleware saw the same request.
        if request.path.startswith("/api/orders/maintenance/"):
            return
        if time.monotonic() - _last_sweep_started < _MIN_INTERVAL_SECONDS:
            return
        if not _sweep_lock.acquire(blocking=False):
            return

        # Reserve the slot before the thread starts so a burst of requests
        # cannot create a queue of sweeps.
        _last_sweep_started = time.monotonic()
        try:
            threading.Thread(
                target=_run_sweep,
                name="unpaid-order-sweep",
                daemon=True,
            ).start()
        except Exception:
            _sweep_lock.release()
            logger.exception("Could not start the opportunistic unpaid-order sweep.")
