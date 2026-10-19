"""
Read-only tools the Shopping Assistant may call, plus the server-side tool
execution layer.

Security model:
- Only functions whitelisted in ``TOOL_HANDLERS`` can run, and each handler
  receives the *server-side* user object — the model can pass no user ID,
  email or role that is ever trusted.
- The catalogue tool only ever reads active (visible to customers) products
  and returns a minimal field set; no internal fields, SKUs or admin data.
- There is no write tool: the model cannot create, cancel, pay or refund
  anything. Ordering mutations stay in ``apps.orders`` behind normal views.
"""
import json
import logging

from apps.products.models import Product

logger = logging.getLogger(__name__)

MAX_SEARCH_RESULTS = 8
MAX_TOOL_RESULT_CHARS = 4000


def _naira(value):
    return f"₦{value:,.0f}"


# --------------------------------------------------------------------------- #
# Tool handlers — each takes the authenticated user plus validated arguments.
# --------------------------------------------------------------------------- #
def search_products(user, query=None, category=None, brand=None, limit=6):
    """Search the active catalogue. Returns verified, customer-visible data only."""
    try:
        limit = max(1, min(int(limit), MAX_SEARCH_RESULTS))
    except (TypeError, ValueError):
        limit = 6

    qs = (
        Product.objects.active()
        .with_effective_price()
        .select_related("brand", "category")
    )
    if query:
        qs = qs.filter(
            name__icontains=query
        ) | Product.objects.active().filter(
            category__name__icontains=query
        ) | Product.objects.active().filter(
            brand__name__icontains=query
        )
        qs = qs.distinct()
    if category:
        qs = qs.filter(category__name__icontains=category)
    if brand:
        qs = qs.filter(brand__name__icontains=brand)

    qs = qs.order_by("-featured", "-bestseller", "-rating")[:limit]

    results = []
    for p in qs:
        results.append(
            {
                "name": p.name,
                "brand": p.brand.name if p.brand else "",
                "category": p.category.name,
                "price": _naira(p.effective_price),
                "was_price": _naira(p.price) if p.discount_price is not None else "",
                "discount_percent": p.discount_percent if p.discount_percent else "",
                "stock": p.get_availability_display(),
                "short_description": (p.short_description or "")[:160],
                "product_page": f"/products/{p.slug}",
                "warranty": p.warranty or "",
            }
        )
    if not results:
        return {
            "result": "No matching products are currently listed in the store."
            + (" Tell the customer the item is not available rather than guessing."
               if query else "")
        }
    return {"result": results}


# Only tools listed here can ever be executed, no matter what the model asks for.
TOOL_HANDLERS = {
    "search_products": search_products,
}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": (
                "Search the store's live catalogue for products (phones, laptops, "
                "gadgets, accessories). Returns verified prices, stock status and "
                "product page links. Use it for any product question instead of "
                "guessing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Free-text search, e.g. 'iPhone', 'gaming laptop', 'power bank'.",
                    },
                    "category": {"type": "string", "description": "Category name filter, e.g. 'Smartphones'."},
                    "brand": {"type": "string", "description": "Brand name filter, e.g. 'HP'."},
                    "limit": {
                        "type": "integer",
                        "description": f"Max products to return, 1–{MAX_SEARCH_RESULTS} (default 6).",
                    },
                },
            },
        },
    }
]


def execute_tool(name, arguments, user):
    """Run a whitelisted tool server-side with validated arguments.

    Never raises: any failure becomes an ``{"error": ...}`` dict the model is
    told to report honestly. Returns output bounded in size for the context.
    """
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return {"error": f"Unknown tool '{name}'. Only search_products is available."}
    if not isinstance(arguments, dict):
        arguments = {}
    try:
        output = handler(user, **arguments)
    except Exception:  # noqa: BLE001 — a tool failure must never surface a stack trace
        logger.exception("AI tool '%s' failed", name)
        return {
            "error": (
                "The product lookup is temporarily unavailable. Tell the "
                "customer you cannot verify product information right now and "
                "to check the shop pages directly."
            )
        }
    rendered = json.dumps(output, ensure_ascii=False)
    if len(rendered) > MAX_TOOL_RESULT_CHARS:
        rendered = rendered[:MAX_TOOL_RESULT_CHARS]
    try:
        return json.loads(rendered)
    except json.JSONDecodeError:
        return {"result": rendered}
