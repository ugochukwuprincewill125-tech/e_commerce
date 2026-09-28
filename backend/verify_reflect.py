"""Verify the admin -> storefront reflect loop over the live API.

1. Admin logs in and creates a product (admin-api).
2. Anonymous customer fetches it from the public catalogue: visible.
3. Admin edits the price: customer sees the new price.
4. Admin archives (deletes) it: customer gets a 404 and search no longer finds it.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000/api"
EMAIL = "admin@timeline.test"
PASSWORD = "AdminPass123!"
SKU = "TGS-VERIFY-001"

results = []


def call(method, path, token=None, payload=None, form=False):
    url = BASE + path
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        if form:
            data = urllib.parse.urlencode(payload, doseq=True).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw}


def check(label, ok, extra=""):
    results.append((label, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{(' — ' + extra) if extra else ''}")


# 1. Admin login
status, body = call("POST", "/auth/login/", payload={"email": EMAIL, "password": PASSWORD})
token = body.get("access") or body.get("data", {}).get("access")
check("admin login", status == 200 and token, f"HTTP {status}")
if not token:
    sys.exit(1)

# 2. Pick a real category
status, cats = call("GET", "/categories/")
rows = cats.get("results") if isinstance(cats, dict) else cats
if rows is None and isinstance(cats, dict):
    rows = cats.get("data", {}).get("results") or []
category_id = rows[0]["id"] if rows else None
check("public categories list", status == 200 and category_id, f"HTTP {status}")

# 3. Admin creates the product (multipart-style form payload works for both parsers)
cleanup_token = token
created = False
pid = slug = None
status, body = call(
    "POST", "/admin-api/products/", token=token,
    payload={
        "name": "Reflect Test Laptop", "sku": SKU,
        "category": category_id, "product_type": "computing",
        "price": "19999.00", "stock_quantity": "7",
        "short_description": "Created by verify_reflect", "description": "Verify reflect loop",
        "is_active": "true", "featured": "false", "bestseller": "false", "new_arrival": "false",
        "specifications": json.dumps({"CPU": "Test Core"}),
    },
    form=True,
)
if status in (200, 201):
    created = True
    pid = body.get("id")
    slug = body.get("slug")
    check("admin creates product", True, f"id={pid} slug={slug}")
else:
    check("admin creates product", False, f"HTTP {status} {json.dumps(body)[:300]}")

if created:
    # 4. Anonymous customer can see it
    status, detail = call("GET", f"/products/{slug}/")
    check("customer sees the new product", status == 200 and detail.get("name") == "Reflect Test Laptop", f"HTTP {status}")
    check("product carries category + price", detail.get("price") is not None and detail.get("category"), "")

    status, listing = call("GET", "/products/?q=" + SKU)
    lrows = listing.get("results", []) if isinstance(listing, dict) else listing
    check("customer search finds it", status == 200 and any(r.get("sku") == SKU for r in lrows), f"HTTP {status}")

    # 5. Admin edits the price; customer sees the change
    status, _ = call("PATCH", f"/admin-api/products/{pid}/", token=token,
                     payload={"price": "24999.00", "discount_price": "19999.00"})
    check("admin edits price", status == 200, f"HTTP {status}")
    status, detail = call("GET", f"/products/{slug}/")
    check("customer sees the edited price",
          status == 200 and str(detail.get("price")) in ("24999.00", "24999.0", "24999"),
          f"HTTP {status} price={detail.get('price')}")

    # 6. Admin deletes (archive); customer no longer sees it
    status, _ = call("DELETE", f"/admin-api/products/{pid}/", token=token)
    check("admin archives product", status in (200, 204), f"HTTP {status}")
    status, _ = call("GET", f"/products/{slug}/")
    check("customer gets 404 after delete", status == 404, f"HTTP {status}")
    status, listing = call("GET", "/products/?q=" + SKU)
    lrows = listing.get("results", []) if isinstance(listing, dict) else listing
    check("customer search no longer finds it", status == 200 and not lrows, f"HTTP {status}")

print()
failed = [label for label, ok in results if not ok]
print(f"{len(results) - len(failed)}/{len(results)} checks passed" + (f" — FAILED: {failed}" if failed else " — ALL PASS"))
sys.exit(1 if failed else 0)
