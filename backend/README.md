# Timeline Global Systems — Backend

Django 5 + DRF backend for a Jumia-style computer & gadgets store. JWT auth,
server-side cart, orders with stock reservation, reviews, coupons — and a
complete staff-only REST API for the admin frontend.

## Stack

| Layer      | Tech |
|------------|------|
| API        | Django 5, Django REST Framework, SimpleJWT |
| Database   | PostgreSQL (Supabase in production) |
| Media      | Backblaze B2 via S3-compatible API (local `media/` in dev) |
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

## Backblaze B2 (product/category/brand images)

1. Create a bucket at [secure.backblaze.com](https://secure.backblaze.com) —
   **public** visibility, e.g. `timeline-media`.
2. **App Keys → Add Application Key** (master key or a bucket-restricted key).
3. Note the bucket's **Endpoint** (Bucket Details), e.g.
   `https://s3.us-west-004.backblazeb2.com`.
4. Fill in:
   ```
   B2_APPLICATION_KEY_ID=...
   B2_APPLICATION_KEY=...
   B2_BUCKET_NAME=timeline-media
   B2_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com
   B2_PUBLIC_BASE_URL=https://f005.backblazeb2.com/file/timeline-media
   ```
5. For a CDN/custom domain later, set `B2_PUBLIC_BASE_URL` to it — uploaded
   files need no migration.

When all four `B2_*` credential variables are present, uploads go to B2
automatically (`apps/core/storage.py`); otherwise files land in `backend/media/`.
Uploads are private-write/public-read, cached for a year, never overwritten.

## Environment

Copy `.env.example` → `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` / `DEBUG` / `ALLOWED_HOSTS` | Core Django |
| `DATABASE_URL` | Postgres/Supabase connection string |
| `B2_*` | Backblaze B2 media storage (optional in dev) |
| `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` | React app origin |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Payments; without them, checkout runs in clearly-labelled test mode |
| `EMAIL_*` | SMTP for verification/reset emails (console backend by default) |

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
| `GET/POST /api/orders/` · `GET /api/orders/<num>/` · `POST …/cancel/` · `POST /api/orders/track/` | Orders + public tracking |
| `GET/POST /api/reviews/` (+ `eligibility/`, `mine/`) | Verified-purchase reviews |
| `POST /api/coupons/apply/` | Coupon validation |
| `GET /api/store-info/` · `POST /api/contact/` · `GET /api/health/` | Store meta |

## Admin API (mounted at `/api/admin-api/`, staff only)

All endpoints require `Authorization: Bearer <access>` from an account with
`is_staff=True`. The admin frontend uses the same JWT flow as customers.

### Dashboard
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/stats/` | Revenue (today/month), order & product counts, low stock, pending reviews/messages, top products, recent orders |

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
| `PATCH /api/admin-api/orders/<id>/payment/` | `{payment_status, payment_reference?, note?}` — `paid` uses the same idempotent service as Paystack; `refunded` returns stock |

### Customers
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/customers/` | With `order_count`/`total_spent`; `?search=` |
| `GET /api/admin-api/customers/<id>/` | Detail incl. addresses |
| `PATCH /api/admin-api/customers/<id>/` | Edit basics |
| `POST /api/admin-api/customers/<id>/set_active/` · `set_staff/` | Toggle flags (superusers protected) |

### Moderation
| Endpoint | Description |
|---|---|
| `GET /api/admin-api/reviews/` · `PATCH …/<id>/approve/` · `DELETE …/<id>/` | Review moderation |
| `GET /api/admin-api/messages/` · `POST …/<id>/resolve/` | Contact messages |

## Deployment checklist

1. `DJANGO_SETTINGS_MODULE=config.settings.prod`
2. `SECRET_KEY` set to a strong random value
3. `DATABASE_URL` → Supabase session-pooler URI, then `python manage.py migrate`
4. All four `B2_*` variables set (prod settings refuse to start without them)
5. `PAYSTACK_SECRET_KEY` set (test mode is force-disabled in prod)
6. `ALLOWED_HOSTS` + `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` → your domains
7. `python manage.py collectstatic` (WhiteNoise serves admin statics)
8. `gunicorn config.wsgi` behind TLS (`SECURE_SSL_REDIRECT`, HSTS enabled)
9. Schedule `python manage.py release_unpaid_orders` (cron/celery beat) to
   expire stale unpaid orders and return stock

## Notes

- **Payments** are intentionally left in test mode until you supply Paystack
  keys; checkout completes with clearly-labelled simulated payments locally.
- **Soft delete** means archived products keep their SKU/slug reserved and all
  analytics; restore is one POST.
- Errors always carry a human-readable `detail` (plus field-level `errors`
  where relevant) — see `apps/core/exceptions.py`.
