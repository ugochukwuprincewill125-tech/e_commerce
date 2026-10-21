# Timeline Gadgets — Backend

Django 5 + DRF backend for a Jumia-style computer & gadgets store. JWT auth,
server-side cart, orders with stock reservation, reviews, coupons — and a
complete staff-only REST API for the admin frontend.

## Stack

| Layer      | Tech |
|------------|------|
| API        | Django 5, Django REST Framework, SimpleJWT |
| Database   | PostgreSQL (Supabase in production) |
| Media      | Cloudinary (local `media/` in dev) |
| Filtering  | django-filter |
| Payments   | Paystack (test mode when no keys set) |

## Local setup

```bash
cd backend
python -m venv venv
source venv/Scripts/activate        # Windows (Git Bash)
pip install -r requirements.txt
cp .env.example .env                # fill in values
python manage.py migrate
python manage.py seed_catalog       # demo catalogue (optional)
python manage.py createsuperuser
python manage.py runserver
```

Always run Django through `venv/Scripts/python.exe` (or an activated venv) —
the global interpreter has none of the dependencies.

## Supabase (production database)

1. Create a project at [supabase.com](https://supabase.com).
2. **Connect → Connection string → URI** → copy the **Session pooler** URI
   (port 5432, no IPv6 dependency).
3. Put it in `DATABASE_URL`:
   ```
   DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
4. Run migrations against it: `python manage.py migrate`.

Supabase is plain Postgres — every existing Django migration applies as-is.
No Supabase-specific code is needed; the table editor/Row Level Security are
not used because Django owns the schema.

## Cloudinary (product/category/brand images)

1. Create an account at [cloudinary.com](https://cloudinary.com) (the free
   tier is enough) and note the **cloud name** shown on the console home page.
2. Console → **API Keys** — copy the API key and API secret.
3. Fill in:
   ```
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```

When all three variables are present, uploads go to Cloudinary automatically
(`apps/core/storage.py`); otherwise files land in `backend/media/`. Uploads are
public-read with deterministic public IDs (`media/products/<id>/…`), so
re-uploading the same key overwrites instead of duplicating.

## Environment

Copy `.env.example` → `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` / `DEBUG` / `ALLOWED_HOSTS` | Core Django |
| `DATABASE_URL` | Postgres/Supabase connection string |
| `CLOUDINARY_*` | Cloudinary media storage (required in prod, optional in dev) |
| `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` | React app origin |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Payments; without them, checkout runs in clearly-labelled test mode |
| `BREVO_*` | Transactional email (Brevo API); `EMAIL_*` is the SMTP/console fallback used until `BREVO_API_KEY` is set. See `../EMAIL_SETUP.md` |
| `EMAIL_TEST_MODE` / `EMAIL_TEST_RECIPIENT` | Redirect/suppress customer email while testing (on by default in dev, forced off in prod) |

## Customer API (mounted at `/api/`)

| Endpoint | Description |
|---|---|
| `POST /api/auth/register/` · `login/` · `logout/` · `refresh/` | JWT auth |
| `POST /api/auth/verify-email/` · `resend-verification/` | Email verification |
| `POST /api/auth/password-reset/` (+ `/confirm/`) · `change-password/` | Password flows |
| `GET/PATCH /api/users/profile/` | Profile (+ avatar upload) |
| `GET /api/users/dashboard/` | Customer overview |
| CRUD `/api/users/addresses/` | Address book |
| `GET /api/products/` · `products/<slug>/` · `…/related/` · `…/facets/` | Catalogue with filters (`?q=&category=&brand=&min_price=&…`) |
| `GET /api/search/suggestions/?q=` | Search suggestions |
| `GET /api/categories/` · `GET /api/brands/` | Taxonomy |
| `GET/DELETE /api/cart/` · `POST /api/cart/items/` · `PATCH/DELETE /api/cart/items/<id>/` | Server-side cart (guests use `X-Cart-Session` header) |
| `POST /api/cart/merge/` · `POST /api/cart/quote/` | Guest-cart merge · totals |
| `GET/POST /api/wishlist/` · `DELETE /api/wishlist/<id>/` · `POST …/move-to-cart/` | Wishlist |
| `GET/POST /api/orders/` · `GET /api/orders/<num>/` · `POST …/cancel/` · `POST …/refresh-payment/` | Orders — refresh-payment re-checks open Paystack attempts |
| `GET/POST /api/reviews/` (+ `eligibility/`, `mine/`) | Verified-purchase reviews |
| `POST /api/coupons/apply/` | Coupon validation |
| `GET /api/store-info/` · `POST /api/contact/` · `GET /api/health/` | Store meta |

## Admin API (mounted at `/api/admin-api/`, staff only)

All endpoints require `Authorization: Bearer <access>` from an account with
`is_staff=True` — admins and superusers both count. Roles are a ladder:
customers < admins (`is_staff`) < superusers. Any panel user can promote a
customer, revoke an admin, or block/unblock a customer or fellow admin. Two
accounts are out of bounds for everyone — superuser accounts (never modifiable
through the API) and your own (no self-lockout). The admin frontend uses the
same JWT flow as customers.

### Dashboard
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/stats/` | Revenue (today/month), order & product counts, low stock, pending reviews/messages, top products, recent orders |

### Image uploads — Cloudinary-backed

Product photos use a sign → PUT → attach flow:

1. `POST /api/admin-api/uploads/sign/` — tiny JSON request:
   `{"items": [{"filename": "macbook.jpg", "content_type": "image/jpeg", "product_id": 7}]}`
   → returns `{uploads: [{upload_url, key, headers, expires_in, storage}]}` (≤20 files at once).
   Categories sign through the same endpoint with `"category_id": 12` instead of `product_id`.
2. `PUT upload_url` with the raw file bytes + the returned `headers` — the URL
   is same-origin (`/api/admin-api/uploads/local/`, staff JWT required) and
   writes through the default media storage: **Cloudinary in production**,
   local `media/` in development.
3. Include the returned `key` values in product create/update via
   `uploaded_images: ["media/products/7/<rand>-macbook.jpg", …]` — each key is
   verified (well-formed **and** present in the storage backend) before attaching.
   Category covers are attached with `image_key: "media/categories/12/<rand>-phones.jpg"`
   on the category update call; `image_key: ""` removes the image.

Constraints enforced server-side: JPEG/PNG/WebP/AVIF only, 10MB per file,
keys scoped to `media/products/<id>/…` or `media/categories/<id>/…`, signatures
expire in 15 minutes.
Because the PUT passes through the API server the body counts against the
host's limits; on Render that is generous, so the 10MB-per-file limit above
is what applies.
The old multipart path (`images[]` files on POST/PATCH, 5MB each) still works
for quick single-file edits.

### Products — create, edit, delete, upload
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/products/` | Paged list. Filters: `?search=&category=&brand=&product_type=&availability=&min_price=&max_price=&featured=&bestseller=&new_arrival=&is_active=&ordering=` |
| `POST /api/admin-api/products/` | Create. `multipart/form-data`: product fields + `images` (or `images[]`) file(s) + optional `image_alt_texts` JSON + optional `variants` JSON array |
| `GET /api/admin-api/products/<id>/` | Full detail incl. images + variants |
| `PATCH /api/admin-api/products/<id>/` | Partial edit. May include `images` JSON (alt/order of existing rows) and `variants` JSON (**full desired set** — omitted variants are deactivated, never deleted) |
| `DELETE /api/admin-api/products/<id>/` | **Soft delete** — sets `is_active=false`, hides from store, keeps order history; restore anytime |
| `POST /api/admin-api/products/<id>/restore/` | Back on the store |
| `POST /api/admin-api/products/<id>/set_featured/` | Toggle featured |
| `GET/POST /api/admin-api/products/<pid>/images/` | List / upload more images |
| `DELETE /api/admin-api/products/<pid>/images/<id>/` | Delete one image |
| `POST /api/admin-api/products/<pid>/images/<id>/reorder/` | `{"image_ids": [3,1,2]}` sets display order |

Example create:
```bash
curl -X POST https://…/api/admin-api/products/ \
  -H "Authorization: Bearer $ACCESS" \
  -F name="MacBook Pro 16" -F sku="TGS-MBP-16" -F category=7 \
  -F price=1250000 -F discount_price=1150000 -F stock_quantity=10 \
  -F product_type=computing -F 'specifications={"CPU":"M4 Pro","RAM":"24GB"}' \
  -F 'variants=[{"variant_type":"storage","value":"1TB","sku":"TGS-MBP-16-1TB","price_adjustment":150000,"stock_quantity":4}]' \
  -F 'images[]=@front.jpg' -F 'images[]=@back.jpg' \
  -F 'image_alt_texts=["Front","Back"]'
```
Product uploads reflect instantly on the public storefront
(`POST` → visible at `GET /api/products/<slug>/`).

### Categories · Brands · Coupons
Full CRUD (`ModelViewSet`) at `/api/admin-api/categories/`, `/brands/`,
`/coupons/`. Categories/brands reject deletion while products reference them.
`image`/`logo` accept file uploads.

### Orders
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/orders/` | `?status=&payment_status=&delivery_method=&ordering=` |
| `GET /api/admin-api/orders/<id>/` | Detail incl. history + tracking timeline |
| `PATCH /api/admin-api/orders/<id>/status/` | `{status, note?}` — cancelling releases reserved stock |
| `PATCH /api/admin-api/orders/<id>/payment/` | `{payment_status, payment_reference?, note?}` — `paid` uses the same idempotent service as Paystack; `refunded` records a support-processed refund (the money moves outside the store) |
| `GET /api/admin-api/receipts/verify/` | Receipt check — `?order_number=&code=`; the first successful check of a paid receipt is recorded, and repeat checks answer with `already_verified` + `verified_by`/`verified_at` |

### Customers
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/customers/` | With `order_count`/`total_spent`; `?search=`, `?is_staff=`, `?is_superuser=` |
| `GET /api/admin-api/customers/<id>/` | Detail incl. addresses |
| `PATCH /api/admin-api/customers/<id>/` | Edit basics (name/phone — never flags) |
| `POST /api/admin-api/customers/<id>/set_active/` | Block/unblock an account; superusers protected, never yourself |
| `POST /api/admin-api/customers/<id>/set_staff/` | Grant/revoke admin access (`{is_staff}`); superusers protected; never grants superuser |

### Moderation
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/reviews/` · `PATCH …/<id>/approve/` · `DELETE …/<id>/` | Review moderation |
| `GET /api/admin-api/messages/` · `POST …/<id>/resolve/` · `DELETE …/<id>/` | Contact messages (delete works on resolved messages only) |

## Deployment checklist

1. `DJANGO_SETTINGS_MODULE=config.settings.prod`
2. `SECRET_KEY` set to a strong random value
3. `DATABASE_URL` → Supabase session-pooler URI, then `python manage.py migrate`
4. All three `CLOUDINARY_*` variables set (prod settings refuse to start without them — images are stored and served by Cloudinary)
5. `PAYSTACK_SECRET_KEY` set (test mode is force-disabled in prod)
6. `ALLOWED_HOSTS` + `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` → your domains
7. `python manage.py collectstatic` (WhiteNoise serves admin statics)
8. `gunicorn config.wsgi` behind TLS (`SECURE_SSL_REDIRECT`, HSTS enabled)
9. Schedule `python manage.py process_unpaid_orders` every 5–10 minutes
   (cron/celery beat, an uptime pinger, or the included GitHub workflow) to
   send payment reminders after 15 minutes and permanently delete unpaid
   orders after the one-hour grace period, releasing their stock. Production
   also enables `UNPAID_ORDER_SWEEP_ON_REQUEST`, a best-effort background
   sweep on incoming requests while the API is awake. `release_unpaid_orders`
   remains as the 48-hour legacy safety net.

## Notes

- **Payments** are intentionally left in test mode until you supply Paystack
  keys; checkout completes with clearly-labelled simulated payments locally.
- **Soft delete** means archived products keep their SKU/slug reserved and all
  analytics; restore is one POST.
- Errors always carry a human-readable `detail` (plus field-level `errors`
  where relevant) — see `apps/core/exceptions.py`.



