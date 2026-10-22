import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.cart.models import CartItem
from apps.cart.pricing import calculate_totals
from apps.notifications.events import (
    send_order_auto_deleted,
    send_order_cancelled,
    send_order_confirmation,
    send_paid_order_notification,
    send_payment_confirmation,
    send_payment_reminder,
)
from apps.products.models import Product, ProductVariant
from apps.promotions.models import Coupon
from apps.users.models import Address

from .models import Order, OrderItem, OrderStatus, PaymentStatus, status_flow

logger = logging.getLogger(__name__)


@transaction.atomic
def create_order_from_cart(user, cart, data):
    """
    Turn the user's server-side cart into an order.

    * Prices come from the database (locked rows), never from the client.
    * Stock is validated and reserved atomically (SELECT … FOR UPDATE).
    * The cart items are row-locked first, so a double-submitted checkout
      (two tabs, double click) can only ever turn into ONE order: the second
      transaction waits, then finds the cart already emptied.
    * The cart is emptied once the order exists.
    """
    items = list(CartItem.objects.select_for_update().filter(cart=cart))
    if not items:
        raise ValidationError({"detail": "Your cart is empty."})

    products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in={i.product_id for i in items})}
    variant_ids = {i.selected_variant_id for i in items if i.selected_variant_id}
    variants = {v.pk: v for v in ProductVariant.objects.select_for_update().filter(pk__in=variant_ids)}

    problems = []
    demand_by_product = defaultdict(int)
    lines = []
    for item in items:
        product = products.get(item.product_id)
        variant = variants.get(item.selected_variant_id) if item.selected_variant_id else None
        if not product or not product.is_active or (item.selected_variant_id and (not variant or not variant.is_active)):
            problems.append(f"{item.product.name} is no longer available.")
            continue
        if variant and item.quantity > variant.stock_quantity:
            problems.append(f"Only {variant.stock_quantity} unit(s) of {product.name} ({variant.value}) left.")
            continue
        demand_by_product[product.pk] += item.quantity
        unit_price = variant.unit_price() if variant else product.current_price
        lines.append((product, variant, item.quantity, unit_price))

    for product_id, qty in demand_by_product.items():
        product = products[product_id]
        if qty > product.stock_quantity:
            problems.append(
                f"{product.name} is out of stock." if product.stock_quantity == 0
                else f"Only {product.stock_quantity} unit(s) of {product.name} left."
            )
    if problems:
        raise ValidationError({"detail": " ".join(problems), "problems": problems})

    subtotal = sum(unit_price * qty for _, _, qty, unit_price in lines)
    delivery_method = data.get("delivery_method", "delivery")
    totals = calculate_totals(subtotal, data.get("coupon_code", ""), data.get("state", ""), delivery_method, data.get("city", ""))
    if data.get("coupon_code") and not totals["coupon"]["valid"]:
        raise ValidationError({"detail": totals["coupon"]["message"], "coupon_code": totals["coupon"]["message"]})

    shipping_address = {}
    if delivery_method == "delivery":
        shipping_address = {k: data.get(k, "") for k in ("address", "city", "state", "country", "postal_code")}

    order = Order.objects.create(
        user=user,
        subtotal=totals["subtotal"],
        shipping_fee=totals["shipping_fee"],
        discount=totals["discount"],
        total=totals["total"],
        coupon=totals["coupon_obj"],
        coupon_code=totals["coupon"]["code"] if totals["coupon"]["valid"] else "",
        first_name=data["first_name"],
        last_name=data["last_name"],
        email=data["email"],
        phone=data["phone"],
        delivery_method=delivery_method,
        pickup_location=data.get("pickup_location", "") if delivery_method == "pickup" else "",
        shipping_address=shipping_address,
        customer_note=data.get("note", ""),
    )

    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                product=product,
                variant=variant,
                product_name=product.name,
                product_sku=variant.sku if variant else product.sku,
                variant_label=variant.label if variant else "",
                quantity=qty,
                unit_price=unit_price,
                total_price=unit_price * qty,
            )
            for product, variant, qty, unit_price in lines
        ]
    )

    # Reserve stock now so two customers can't buy the last unit.
    for product, variant, qty, _ in lines:
        Product.objects.filter(pk=product.pk).update(stock_quantity=F("stock_quantity") - qty)
        if variant:
            ProductVariant.objects.filter(pk=variant.pk).update(stock_quantity=F("stock_quantity") - qty)

    order.add_history(OrderStatus.PLACED, "Order received — awaiting payment.")
    cart.items.all().delete()

    if data.get("save_address") and delivery_method == "delivery":
        exists = Address.objects.filter(user=user, address__iexact=data["address"], city__iexact=data["city"]).exists()
        if not exists:
            Address.objects.create(
                user=user, first_name=data["first_name"], last_name=data["last_name"], phone=data["phone"],
                address=data["address"], city=data["city"], state=data["state"],
                country=data.get("country") or "Nigeria", postal_code=data.get("postal_code", ""),
            )

    # The outbox row is part of this transaction, so a rolled-back checkout
    # never produces an order-confirmation email.
    send_order_confirmation(order)
    return order


@transaction.atomic
def restore_stock(order):
    """Return reserved stock to inventory (cancelled / expired orders). Idempotent."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.stock_restored:
        return
    for item in order.items.select_related("product", "variant"):
        if item.product_id:
            Product.objects.filter(pk=item.product_id).update(stock_quantity=F("stock_quantity") + item.quantity)
        if item.variant_id:
            ProductVariant.objects.filter(pk=item.variant_id).update(stock_quantity=F("stock_quantity") + item.quantity)
    order.stock_restored = True
    order.save(update_fields=["stock_restored", "updated_at"])


@transaction.atomic
def cancel_order(order, note="Cancelled by customer."):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status == OrderStatus.CANCELLED:
        return order
    order.status = OrderStatus.CANCELLED
    if order.payment_status == PaymentStatus.PENDING:
        order.payment_status = PaymentStatus.FAILED
    order.save(update_fields=["status", "payment_status", "updated_at"])
    order.add_history(OrderStatus.CANCELLED, note)
    restore_stock(order)
    send_order_cancelled(order, reason=note)
    return order


@transaction.atomic
def mark_order_paid(order, reference, note="Payment confirmed via Paystack."):
    """Idempotently mark an order as paid."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.payment_status == PaymentStatus.PAID:
        return order, False
    order.payment_status = PaymentStatus.PAID
    order.payment_reference = reference
    order.paid_at = timezone.now()
    fields = ["payment_status", "payment_reference", "paid_at", "updated_at"]
    if order.status == OrderStatus.PLACED:
        order.status = OrderStatus.PAYMENT_CONFIRMED
        fields.append("status")
        order.add_history(OrderStatus.PAYMENT_CONFIRMED, note)
    elif order.status == OrderStatus.CANCELLED:
        logger.warning("Payment %s received for cancelled order %s — manual review needed.", reference, order)
        order.add_history(OrderStatus.CANCELLED, "Payment received after cancellation — review and refund or reinstate.")
    order.save(update_fields=fields)
    if order.coupon_id:
        Coupon.objects.filter(pk=order.coupon_id).update(times_used=F("times_used") + 1)
    # Reached only after server-side verification (Paystack callback/webhook)
    # or a deliberate staff confirmation — never from browser-reported success.
    send_payment_confirmation(order, reference)
    # ...and the store gets its copy, so a confirmed sale is never missed.
    # This fires on the transition to paid only, so an abandoned checkout
    # never reaches the team inbox.
    send_paid_order_notification(order)
    return order, True


@transaction.atomic
def delete_order(order):
    """Permanently remove one of the customer's own orders.

    Only placed-but-unpaid orders qualify. The state is re-checked under the
    row lock because a delayed payment webhook can land between the view's
    Paystack re-check and this delete. Such an order is still holding reserved
    stock, so it is released before the rows are removed.
    """
    order = Order.objects.select_for_update().get(pk=order.pk)
    if not order.can_delete:
        raise ValidationError("Only orders that have been placed but not yet paid can be deleted.")

    from apps.payments.models import Payment

    if order.payments.filter(status=Payment.Status.SUCCESS).exists():
        raise ValidationError(
            "A payment has been confirmed for this order, so it can no longer be deleted."
        )

    restore_stock(order)
    order.delete()


def payment_state_before_delete(order):
    """Check whether an unpaid order is safe to remove right now.

    A customer can complete a Paystack payment without the webhook reaching us
    immediately. Before deleting an "unpaid" order we therefore re-verify every
    open attempt. Returns one of:

    * ``"paid"``    — a successful payment exists (or was just confirmed);
    * ``"pending"`` — Paystack still considers an attempt in flight;
    * ``"error"``   — Paystack could not be reached, so we do not know;
    * ``"clear"``   — no successful or in-flight payment; deletion is safe.

    Deletion deliberately treats ``pending`` and ``error`` as "not safe" and
    retries on the next sweep rather than risking a paid order being removed.
    """
    # Local check first: never delete rows that already hold a successful
    # charge, even if the order flags somehow lag behind.
    from apps.payments.models import Payment

    if order.payments.filter(status=Payment.Status.SUCCESS).exists():
        return "paid"

    # Local import avoids a circular import: payments.services imports the
    # order services used by webhooks and reconcile callbacks.
    from apps.payments.services import reconcile_order_payments

    changed, results = reconcile_order_payments(order)
    if changed:
        return "paid"
    outcomes = {outcome for _, outcome in results}
    if "error" in outcomes:
        return "error"
    if "pending" in outcomes:
        return "pending"
    return "clear"


def send_unpaid_order_reminders(limit=200, now=None):
    """Email customers whose placed order is still unpaid after the grace period.

    Each order receives exactly one reminder; ``payment_reminder_sent_at`` is
    the idempotency guard and also starts the deletion countdown. Returns the
    number of reminders queued.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(minutes=settings.UNPAID_ORDER_REMINDER_MINUTES)
    candidate_ids = list(
        Order.objects.filter(
            status=OrderStatus.PLACED,
            payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
            paid_at__isnull=True,
            payment_reminder_sent_at__isnull=True,
            created_at__lte=cutoff,
        )
        .order_by("created_at")
        .values_list("pk", flat=True)[: max(1, int(limit))]
    )

    reminded = 0
    for order_id in candidate_ids:
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(pk=order_id).first()
            if order is None or not order.can_pay or order.payment_reminder_sent_at:
                continue
            deadline = now + timedelta(minutes=settings.UNPAID_ORDER_DELETION_GRACE_MINUTES)
            record = send_payment_reminder(order, auto_delete_at=deadline)
            if record is None:
                # Never start the countdown without a queued reminder. The
                # order stays eligible for the legacy 48-hour release.
                logger.warning("Could not queue payment reminder for order %s.", order.order_number)
                continue
            order.payment_reminder_sent_at = now
            order.save(update_fields=["payment_reminder_sent_at", "updated_at"])
            reminded += 1

    if reminded:
        logger.info("Queued %s unpaid-order payment reminder(s).", reminded)
    return reminded


def delete_expired_unpaid_orders(limit=200, now=None):
    """Delete orders whose reminder grace period has elapsed without payment.

    Returns ``(deleted, deferred)``. ``deferred`` counts orders kept because a
    Paystack payment was still pending or could not be checked; those are
    retried on the next sweep.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(minutes=settings.UNPAID_ORDER_DELETION_GRACE_MINUTES)
    candidate_ids = list(
        Order.objects.filter(
            status=OrderStatus.PLACED,
            payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
            paid_at__isnull=True,
            payment_reminder_sent_at__lte=cutoff,
        )
        .order_by("payment_reminder_sent_at")
        .values_list("pk", flat=True)[: max(1, int(limit))]
    )

    deleted = 0
    deferred = 0
    for order_id in candidate_ids:
        order = Order.objects.filter(pk=order_id).first()
        if order is None:
            continue

        # The provider call happens outside the row lock/transaction.
        state = payment_state_before_delete(order)
        if state == "paid":
            continue
        if state in ("pending", "error"):
            deferred += 1
            logger.info(
                "Deferred deletion of order %s — payment state is '%s'.",
                order.order_number,
                state,
            )
            continue

        with transaction.atomic():
            order = Order.objects.select_for_update().filter(pk=order_id).first()
            if order is None:
                continue
            # Re-check under the lock; a webhook or the customer may have paid
            # while Paystack was being queried.
            if (
                order.status != OrderStatus.PLACED
                or order.payment_status not in (PaymentStatus.PENDING, PaymentStatus.FAILED)
                or order.paid_at
                or not order.payment_reminder_sent_at
                or order.payment_reminder_sent_at > cutoff
            ):
                continue

            from apps.payments.models import Payment

            successful = order.payments.filter(status=Payment.Status.SUCCESS).first()
            if successful is not None:
                # Defensive: make the local record reflect the successful
                # charge instead of deleting it.
                mark_order_paid(order, successful.reference)
                continue

            # The outbox row and the deletion commit together: either the
            # customer gets the goodbye email and the order is gone, or
            # neither happens.
            send_order_auto_deleted(order)
            restore_stock(order)
            order.delete()
            deleted += 1

    if deleted or deferred:
        logger.info(
            "Unpaid-order cleanup: %s deleted, %s deferred (payment still pending/unverifiable).",
            deleted,
            deferred,
        )
    return deleted, deferred


def process_unpaid_order_followups(*, limit=200, now=None, cancel_stale_legacy=True):
    """Run the reminder + auto-deletion cycle.

    Called by the management command and the token-guarded maintenance
    endpoint. The legacy 48-hour release is kept as a safety net for orders
    created before this flow (or whose reminder could not be queued), so stock
    can never be held indefinitely.
    """
    now = now or timezone.now()
    reminded = send_unpaid_order_reminders(limit=limit, now=now)
    deleted, deferred = delete_expired_unpaid_orders(limit=limit, now=now)
    cancelled = release_stale_unpaid_orders() if cancel_stale_legacy else 0
    return {
        "reminded": reminded,
        "deleted": deleted,
        "deferred": deferred,
        "cancelled_legacy": cancelled,
    }


def release_stale_unpaid_orders(hours=None):
    """Cancel unpaid orders older than ``hours`` and return their stock.

    Shared by the ``release_unpaid_orders`` management command and the
    maintenance endpoint the scheduled workflow calls, so an order that is
    never paid for cannot hold stock hostage forever — especially the last
    unit of a hot product.
    """
    hours = settings.UNPAID_ORDER_EXPIRY_HOURS if hours is None else hours
    cutoff = timezone.now() - timedelta(hours=hours)
    stale = Order.objects.filter(
        status=OrderStatus.PLACED,
        payment_status__in=[PaymentStatus.PENDING, PaymentStatus.FAILED],
        created_at__lt=cutoff,
    )
    count = 0
    for order in stale:
        cancel_order(order, note="Automatically cancelled — payment not received in time.")
        count += 1
    if count:
        logger.info("Released %s expired unpaid order(s) (older than %sh).", count, hours)
    return count


def tracking_steps(order):

    flow = status_flow(order.delivery_method)
    reached = {h.status: h.created_at for h in order.history.all()}
    if order.status == OrderStatus.CANCELLED:
        current_index = -1
    else:
        current_index = flow.index(order.status) if order.status in flow else 0
    steps = []
    for index, status in enumerate(flow):
        steps.append(
            {
                "key": status.value,
                "label": status.label,
                "completed": current_index >= index,
                "current": current_index == index,
                "timestamp": reached.get(status.value),
            }
        )
    return steps
