"""
Application-knowledge layer for the Shopping Assistant.

This module is the controlled source of verified facts about the customer-facing
application: real routes (mirroring ``frontend/src/components/Account/AccountNav.jsx``
and ``frontend/src/App.jsx``), the real checkout flow (``frontend/src/pages/Checkout/Checkout.jsx``),
real shipping fees (``apps.core.store.shipping_settings``), real order-status
flows (``apps.orders.models``) and the real support contacts
(``apps.core.store.COMPANY``). Nothing in here may be invented: if a fact is not
in code, it does not appear in the prompt.

Rebuilding the prompt text at request time keeps it consistent with settings and
the database, so the assistant's knowledge updates without editing prose.
"""
from django.conf import settings

from apps.core.store import COMPANY, shipping_settings

# Single customer-support WhatsApp line. Must match the floating WhatsApp
# button in ``frontend/src/components/WhatsApp/FloatingWhatsApp.jsx``.
SUPPORT_WHATSAPP = getattr(settings, "SUPPORT_WHATSAPP", "2347062895442")


def _catalogue_names():
    """Active category and brand names straight from the database."""
    try:
        from apps.brands.models import Brand
        from apps.categories.models import Category

        categories = list(
            Category.objects.filter(is_active=True)
            .order_by("name")
            .values_list("name", flat=True)[:40]
        )
        brands = list(
            Brand.objects.filter(is_active=True)
            .order_by("name")
            .values_list("name", flat=True)[:40]
        )
    except Exception:
        return "", ""
    return ", ".join(categories), ", ".join(brands)


def app_knowledge():
    """Verified navigation, shopping and support knowledge for the prompt."""
    fees = shipping_settings()
    naira = lambda v: f"₦{v:,.0f}"  # noqa: E731
    categories, brands = _catalogue_names()

    contact = f"Email: {COMPANY['email']}"
    if SUPPORT_WHATSAPP:
        contact += f" · WhatsApp: +{SUPPORT_WHATSAPP}"

    return f"""
APPLICATION KNOWLEDGE (verified — use these exact sections, routes and facts \
instead of guessing):

CUSTOMER NAVIGATION
- Home (/) — the storefront landing page with promotions and featured items.
- Dashboard (/account) — the customer's personal overview: recent orders, \
saved addresses, wishlist summary and quick links.
- My Orders (/account/orders) — order history; open any order for its full \
detail page (/account/orders/<order_number>).
- My Receipts (/account/receipts) — receipts for paid orders, with a detail \
page per receipt (/account/receipts/<reference>).
- My Wishlist (/account/wishlist) — products saved for later.
- My Cart (/cart) — cart items, quantity controls, coupon field and the road \
to checkout. A slide-out cart drawer is also available from the navbar.
- Saved Addresses (/account/addresses) — add, edit, remove and default \
delivery addresses.
- Profile Settings (/account/profile) — account details and password changes.
- Categories (/categories; members also have /account/categories) — browse by \
product type.
- Brands (/brands) — browse by brand; a brand page shows its products.
- All Products (/shop) — the full catalogue with search, filtering and sorting.
- Product detail (/products/<slug>) — images, price, stock, variants, reviews, \
add to cart.
- Help pages: /shipping (shipping information), /returns (returns and \
refunds), /faqs, /about, /contact — reaching /contact opens the support form.

CATALOGUE
- Categories available: {categories or "(list them from the catalogue search tool)"}.
- Brands available: {brands or "(list them from the catalogue search tool)"}.
- Product listings show name, brand, category, price, any discount, stock \
availability and a detail page — quote these only from the catalogue search \
tool, never from memory.

CART AND CHECKOUT
- Cart lives at /cart (plus the navbar drawer). Checkout at /checkout requires \
signing in and walks through four steps: 1 Customer → 2 Delivery → 3 Review \
→ 4 Payment.
- Delivery step options: Home/Office Delivery (address required) or free \
Store Pickup at Computer Village, Ikeja, Lagos.
- Shipping fees: Lagos metro {naira(fees['lagos'])}, the South West including \
Ikorodu {naira(fees['south_west'])}, the South East and South South plus Kwara \
{naira(fees['south_east'])}, and the northern states plus Akwa Ibom/Cross River \
{naira(fees['north'])}; store pickup is free; orders of \
{naira(fees['free_shipping_threshold'])} or more ship free. Orders above 2 kg \
may attract a ₦1,500 heavy-parcel surcharge.
- Payment is processed by Paystack (card, bank transfer, USSD). After paying, \
the customer returns to /payment/callback and the order page shows a \
"Refresh payment" action if the status lags.

ORDERS, PAYMENT STATUS AND RECEIPTS
- Order numbers look like TGS-YYMMDD-XXXXX.
- Delivery orders advance: Placed → Payment Confirmed → Processing → Ready \
for Delivery → Shipped → Delivered. Pickup orders end: Ready for Store \
Pickup → Picked Up.
- Payment status values: Pending, Paid, Failed, Refunded. Never assert a \
payment succeeded unless status is Paid.
- An order can be cancelled or deleted by the customer only while it is \
Placed and not yet paid. An unpaid order also gets one payment reminder \
email {settings.UNPAID_ORDER_REMINDER_MINUTES} minutes after checkout; if it \
is still unpaid {settings.UNPAID_ORDER_DELETION_GRACE_MINUTES} minutes after \
that reminder it is deleted automatically from the customer's and the \
store's order lists, and its reserved stock is returned. Refunds are \
arranged through support — the assistant cannot issue them.
- Receipts exist for paid orders, listed under My Receipts and on the order \
detail page.

SUPPORT CONTACT (verified — never invent another)
{contact}
Store: {COMPANY['name']}, Computer Village, Ikeja, Lagos. Hours: \
{'; '.join(h['days'] + ' ' + h['hours'] for h in COMPANY['business_hours'])}.

If a question falls outside this knowledge or the tools, say you cannot \
verify it and point the customer to the support contact above.
"""


def customer_context(orders):
    """Compact, minimum-necessary snapshot of the requesting customer's orders.

    Built server-side from the authenticated user; the model never chooses
    whose data to inspect. Only fields useful for support are included.
    """
    if not orders:
        return "\nCONTEXT — This customer has no orders on their account yet.\n"
    lines = ["\nCONTEXT — Verified facts about this customer's own orders (the only \
order data you may discuss):"]
    for o in orders:
        row = (
            f"- {o.order_number} · {o.get_status_display()} · payment "
            f"{o.get_payment_status_display()} · total ₦{o.total:,.0f} · "
            f"placed {o.created_at:%d %b %Y}"
        )
        if o.delivery_method == "pickup":
            row += " · Store pickup"
        elif o.tracking_number:
            row += f" · {o.carrier} tracking {o.tracking_number}"
        lines.append(row)
    lines.append(
        "Paid orders have receipts under My Receipts (/account/receipts). "
        "Other customers' orders do not exist in this context and any request "
        "for them must be refused."
    )
    return "\n".join(lines) + "\n"
