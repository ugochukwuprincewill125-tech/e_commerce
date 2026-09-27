import logging
from collections import defaultdict

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.cart.pricing import calculate_totals
from apps.products.models import Product, ProductVariant
from apps.promotions.models import Coupon
from apps.users.models import Address

from .models import Order, OrderItem, OrderStatus, PaymentStatus

logger = logging.getLogger(__name__)


@transaction.atomic
def create_order_from_cart(user, cart, data):
    """
    Turn the user's server-side cart into an order.

    * Prices come from the database (locked rows), never from the client.
    * Stock is validated and reserved atomically (SELECT … FOR UPDATE).
    * The cart is emptied once the order exists.
    """
    items = list(cart.items.all())
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
    totals = calculate_totals(subtotal, data.get("coupon_code", ""), data.get("state", ""), delivery_method)
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
        product.stock_quantity -= qty
        product.save(update_fields=["stock_quantity"])
        if variant:
            variant.stock_quantity -= qty
            variant.save(update_fields=["stock_quantity"])

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
    return order


@transaction.atomic
def restore_stock(order):
    """Return reserved stock to inventory (cancelled / expired orders). Idempotent."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.stock_restored:
        return
    for item in order.items.select_related("product", "variant"):
        if item.product_id:
            product = Product.objects.select_for_update().get(pk=item.product_id)
            product.stock_quantity += item.quantity
            product.save(update_fields=["stock_quantity"])
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
    return order, True


def tracking_steps(order):
    from .models import STATUS_FLOW

    reached = {h.status: h.created_at for h in order.history.all()}
    if order.status == OrderStatus.CANCELLED:
        current_index = -1
    else:
        current_index = STATUS_FLOW.index(order.status) if order.status in STATUS_FLOW else 0
    steps = []
    for index, status in enumerate(STATUS_FLOW):
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
