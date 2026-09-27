import uuid

from django.db import transaction

from .models import Cart, CartItem

CART_HEADER = "HTTP_X_CART_SESSION"


def _session_id_from(request):
    raw = request.META.get(CART_HEADER, "").strip()
    try:
        return uuid.UUID(raw) if raw else None
    except ValueError:
        return None


def cart_queryset():
    return Cart.objects.prefetch_related(
        "items__product__images",
        "items__product__brand",
        "items__product__category",
        "items__selected_variant",
    )


def get_cart(request, create=True):
    """Return the cart for the signed-in user, or the guest cart in the header."""
    if request.user.is_authenticated:
        cart = cart_queryset().filter(user=request.user).first()
        if cart is None and create:
            cart = Cart.objects.create(user=request.user)
            cart = cart_queryset().get(pk=cart.pk)
        return cart

    session_id = _session_id_from(request)
    if session_id:
        cart = cart_queryset().filter(session_id=session_id, user__isnull=True).first()
        if cart:
            return cart
    if create:
        cart = Cart.objects.create()
        return cart_queryset().get(pk=cart.pk)
    return None


@transaction.atomic
def merge_guest_cart(user, session_id):
    """Move items from a guest cart into the user's cart after sign-in."""
    try:
        session_uuid = uuid.UUID(str(session_id))
    except (ValueError, TypeError):
        return
    guest = Cart.objects.filter(session_id=session_uuid, user__isnull=True).first()
    if not guest:
        return
    user_cart, _ = Cart.objects.get_or_create(user=user)
    for item in guest.items.select_related("product", "selected_variant"):
        existing = CartItem.objects.filter(
            cart=user_cart, product=item.product, selected_variant=item.selected_variant
        ).first()
        if existing:
            existing.quantity = min(existing.quantity + item.quantity, max(existing.available_stock, 1))
            existing.save(update_fields=["quantity"])
        else:
            item.pk = None
            item.cart = user_cart
            item.quantity = min(item.quantity, max(item.available_stock, 1))
            item.save()
    guest.delete()
