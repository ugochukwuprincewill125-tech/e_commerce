# Timeline Global Systems Limited — E-commerce Platform

**Home of Quality Gadgets** · Computer Village, Ikeja, Lagos

A full-stack e-commerce store:

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 18 + Vite, Tailwind CSS, Framer Motion, React Router, Axios, TanStack Query, React Hook Form, Lucide React |
| Backend   | Python 3.11+, Django 5, Django REST Framework, SimpleJWT |
| Database  | PostgreSQL |
| Payments  | Paystack (server-side initialize, verify and webhook) |

The React app talks to Django only through the REST API. Cart, wishlist, orders, reviews, stock and prices all live on the server. The browser never decides what anything costs.

---

## Contents

1. [Project structure](#1-project-structure)
2. [Requirements](#2-requirements)
3. [Database setup (PostgreSQL)](#3-database-setup-postgresql)
4. [Backend setup](#4-backend-setup)
5. [Frontend setup](#5-frontend-setup)
6. [Environment variables](#6-environment-variables)
7. [Seed data](#7-seed-data)
8. [Official logo and images](#8-official-logo-and-images)
9. [Payments (Paystack)](#9-payments-paystack)
10. [API reference](#10-api-reference)
11. [Admin dashboard](#11-admin-dashboard)
12. [Security notes](#12-security-notes)
13. [Production deployment](#13-production-deployment)
14. [Before you go live — checklist](#14-before-you-go-live--checklist)

---

## 1. Project structure

```text
timeline-global-systems/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/
│   │   ├── settings/ (base.py, dev.py, prod.py)
│   │   ├── urls.py  wsgi.py  asgi.py
│   ├── apps/
│   │   ├── core/        store info, contact form, pagination, errors, seed_data, image generator, admin dashboard
│   │   ├── users/       custom User (email login), Address, JWT auth, email verification, password reset
│   │   ├── categories/  nested categories
│   │   ├── brands/
│   │   ├── products/    Product, ProductImage, ProductVariant, search + filters, inventory
│   │   ├── cart/        server-side cart (guest + signed-in), pricing engine
│   │   ├── wishlist/
│   │   ├── orders/      Order, OrderItem, status history, tracking, stock reservation
│   │   ├── payments/    Paystack client, verify, webhook
│   │   ├── reviews/     verified-purchase reviews, rating aggregation
│   │   └── promotions/  Coupons
│   ├── templates/admin/index.html   (sales + low-stock panel on the admin home page)
│   └── media/  (products/, brands/, categories/, users/ are created automatically)
└── frontend/
    ├── index.html  vite.config.js  tailwind.config.js  .env.example
    ├── public/brand/            ← put the official logo here
    └── src/
        ├── components/  Navbar, Footer, ProductCard, ProductGrid, SearchBar, CartDrawer,
        │                CategoryCard, BrandCard, Rating, Button, Modal, Loader, OrderTimeline, …
        ├── pages/       Home, Shop, ProductDetails, Categories, Brands, Cart, Checkout, Login,
        │                Register, Dashboard, Orders, Wishlist, About, Contact, Info, NotFound
        ├── services/    api.js, productService.js, authService.js, cartService.js, orderService.js
        ├── context/     AuthContext, CartContext, WishlistContext, ToastContext
        ├── hooks/  utils/
        └── App.jsx  main.jsx  index.css
```

---

## 2. Requirements

- Python **3.11+**
- Node.js **18+** (20 or 22 recommended)
- PostgreSQL **14+**

---

## 3. Database setup (PostgreSQL)

Create a database and a user (psql, pgAdmin or any tool):

```sql
CREATE USER timeline WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE timeline_db OWNER timeline;
```

Then set `DATABASE_URL` in `backend/.env`:

```text
DATABASE_URL=postgres://timeline:choose-a-strong-password@localhost:5432/timeline_db
```

---

## 4. Backend setup

```bash
cd backend

python -m venv venv
# Windows:        venv\Scripts\activate
# macOS / Linux:  source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env          # Windows: copy .env.example .env
# edit .env: set SECRET_KEY and DATABASE_URL

python manage.py migrate
python manage.py seed_data
python manage.py createsuperuser
python manage.py runserver
```

- API: <http://localhost:8000/api/>
- Admin: <http://localhost:8000/admin/>

Generate a secret key with:

```bash
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```

In development, emails (verification, password reset) are **printed to the terminal** running `runserver`. Copy the link from there.

---

## 5. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run dev
```

Open <http://localhost:5173>.

> Use the same host consistently (`localhost`, not `127.0.0.1`). The backend's `FRONTEND_URL` is used for payment callbacks and email links, and each origin keeps its own sign-in session.

Production build: `npm run build`, which outputs to `frontend/dist/`.

---

## 6. Environment variables

### `backend/.env`

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Django secret key (**required in production**) |
| `DEBUG` | `True` for development, `False` in production |
| `ALLOWED_HOSTS` | Comma-separated hostnames, e.g. `api.timelinegadgets.com` |
| `DATABASE_URL` | `postgres://USER:PASSWORD@HOST:PORT/DB` |
| `FRONTEND_URL` | Public URL of the React site (email links and Paystack callback) |
| `CORS_ALLOWED_ORIGINS` | Origins allowed to call the API, e.g. `https://timelinegadgets.com` |
| `CSRF_TRUSTED_ORIGINS` | Same origins, for admin/CSRF |
| `PAYSTACK_SECRET_KEY` | Paystack **secret** key. Server only, never in React. |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key (exposed via `/api/payments/config/`) |
| `PAYMENT_TEST_MODE` | Simulated payments when no secret key is set (**dev only**; forced off in production) |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | SMTP for verification and password-reset emails |
| `LOW_STOCK_THRESHOLD` | Stock level at or below which products show **Low Stock** (default 5) |
| `SHIPPING_FEE_LAGOS`, `SHIPPING_FEE_SOUTH_WEST`, `SHIPPING_FEE_DEFAULT` | Delivery fees in Naira |
| `FREE_SHIPPING_THRESHOLD` | Order subtotal (₦) above which delivery is free |
| `UNPAID_ORDER_EXPIRY_HOURS` | Used by `release_unpaid_orders` |
| `REVIEWS_REQUIRE_APPROVAL` | `True` to hold new reviews for admin approval |

### `frontend/.env`

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | e.g. `http://localhost:8000/api` |
| `VITE_SITE_URL` | Public site URL for canonical and Open Graph tags |

Anything prefixed `VITE_` is public. **Never** put secret keys in the frontend.

---

## 7. Seed data

```bash
python manage.py seed_data                # 40 categories, 26 brands, 65 products, images, variants, coupons, sample reviews
python manage.py seed_data --reset        # wipe the catalogue and re-seed
python manage.py seed_data --no-reviews   # skip sample reviewers/reviews
python manage.py seed_data --no-images    # faster, no generated artwork
python manage.py seed_data --clear-samples  # remove sample reviewers, their reviews and the demo account
```

The command is idempotent, so running it again updates records instead of duplicating them.

It creates:

- **40 categories** (nested, e.g. Smartphones → Android Phones / iPhones)
- **26 brands**, and **65 products** with Naira prices, specifications, variants (storage, colour, RAM, capacity), stock levels (including low-stock and out-of-stock examples) and 2–3 generated images each
- Coupons: `WELCOME10` (10%, max ₦20,000, min ₦20,000) and `TIMELINE5K` (₦5,000 off orders above ₦100,000)
- A demo customer: **demo@timeline.test / Timeline@2026**
- Sample reviews from clearly marked sample accounts (`@sample.timeline.invalid`, not marked "verified purchase")

> Prices are **sample development data**. Update them in the admin to match Timeline's real price list.

---

## 8. Official logo and images

### Logo

Put the official logo files in `frontend/public/brand/`:

- `timeline-logo.png`: the standard logo (navbar, auth pages, about page)
- `timeline-logo-white.png` (optional): a version for dark backgrounds (footer). If it is missing, the standard logo is shown on a small white plate so it stays legible.

The `<Logo />` component (`src/components/Logo/Logo.jsx`) sizes the image by height with `object-contain`, so the logo is never stretched, recoloured or distorted. Until the file exists, the company name is shown as plain text in the logo position. That text is a placeholder, not a logo.

Also replace `frontend/public/favicon.svg` with an icon derived from the official logo.

**Brand colour:** the site uses one accent colour, the `brand` scale in `frontend/tailwind.config.js`. Set it to the logo's accent colour and the whole site updates.

### Product photography

Seeded products use generated placeholder artwork stored in `backend/media/`. To use real Timeline photos, open **Admin → Products → (product) → Images**, upload photos and delete the placeholders. Categories (image) and brands (logo) work the same way. Brand pages show brand **names** as text. Only upload brand logos you're permitted to use.

Media layout: `media/products/`, `media/brands/`, `media/categories/`, `media/users/`.

---

## 9. Payments (Paystack)

The payment flow runs entirely through the backend:

1. `POST /api/orders/` creates the order from the **server-side cart**. Prices, discount, delivery fee and total are calculated on the server, and stock is reserved atomically.
2. `POST /api/payments/initialize/` sends Paystack the **server's** order total and returns Paystack's hosted checkout URL.
3. Paystack redirects the customer to `FRONTEND_URL/payment/callback?reference=…`.
4. `GET /api/payments/verify/<reference>/` confirms the transaction with Paystack and checks that the amount, currency and reference match before marking the order **Paid / Payment Confirmed**.
5. `POST /api/payments/webhook/` receives `charge.success` events, verified with the `x-paystack-signature` HMAC-SHA512 header. It is idempotent.

**To enable real payments:**

1. Get your keys from <https://dashboard.paystack.com/#/settings/developers>
2. In `backend/.env` set `PAYSTACK_SECRET_KEY=sk_live_…` (or `sk_test_…`) and `PAYSTACK_PUBLIC_KEY=pk_…`
3. In the Paystack dashboard, set the **Webhook URL** to `https://YOUR-API-DOMAIN/api/payments/webhook/`
4. Restart Django.

**Test mode:** with no secret key and `DEBUG=True`, checkout completes with a clearly labelled *simulated* payment, so you can test the full flow locally. Test mode is always disabled in production settings.

Unpaid orders hold reserved stock. Release stale ones on a schedule (for example hourly with cron):

```bash
python manage.py release_unpaid_orders            # uses UNPAID_ORDER_EXPIRY_HOURS
python manage.py release_unpaid_orders --dry-run
```

---

## 10. API reference

All endpoints are under `/api/`. Authentication uses `Authorization: Bearer <access token>`. Guest carts send `X-Cart-Session: <uuid>`, which is returned as `session_id` by `GET /api/cart/`. Errors always include a readable `detail`; validation errors also include `errors`.

### Auth: `/api/auth/`
| Method | Endpoint | Notes |
|---|---|---|
| POST | `register/` | `{first_name, last_name, email, phone?, password, confirm_password}` → user + tokens, sends verification email |
| POST | `login/` | `{email, password}` → `{access, refresh, user}` |
| POST | `refresh/` | `{refresh}` → new access and rotated refresh |
| POST | `logout/` | `{refresh}` → blacklists the refresh token |
| POST | `verify-email/` | `{uid, token}` |
| POST | `resend-verification/` | auth |
| POST | `password-reset/` | `{email}` (always 200) |
| POST | `password-reset/confirm/` | `{uid, token, new_password, confirm_password}` |
| POST | `change-password/` | auth `{current_password, new_password}` |

### Users: `/api/users/`
`GET/PATCH profile/` (multipart for `profile_image`) · `GET dashboard/` · `CRUD addresses/`

### Catalogue
| Endpoint | Notes |
|---|---|
| `GET /api/products/` | `q, category, brand (comma list), min_price, max_price, rating, in_stock, on_sale, min_discount, product_type, featured, bestseller, new_arrival, slugs, ordering (effective_price, -effective_price, -created_at, -rating, -review_count, name), page, page_size` |
| `GET /api/products/<slug>/` | full details: images, variants, specs, rating breakdown, breadcrumbs |
| `GET /api/products/<slug>/related/` | |
| `GET /api/products/facets/` | sidebar filter options (`category`, `q`) |
| `GET /api/search/suggestions/?q=` | products, categories and brands for autocomplete |
| `GET /api/categories/` · `/api/categories/<slug>/` | `?root=true`, `?featured=true` |
| `GET /api/brands/` · `/api/brands/<slug>/` | only brands with active products |

### Cart & wishlist
| Endpoint | Notes |
|---|---|
| `GET / DELETE /api/cart/` | view / clear |
| `POST /api/cart/items/` | `{product_id, variant_id?, quantity}`, validated against stock |
| `PATCH / DELETE /api/cart/items/<id>/` | |
| `POST /api/cart/merge/` | `{session_id}`, merges the guest cart after sign-in |
| `POST /api/cart/quote/` | `{coupon_code?, state?, delivery_method?}`, server-calculated totals |
| `POST /api/coupons/apply/` | `{code, state?, delivery_method?}` |
| `GET / POST /api/wishlist/` | `{product_id}` |
| `DELETE /api/wishlist/<product_id>/` · `POST /api/wishlist/<product_id>/move-to-cart/` | |

### Orders, payments, reviews, store
| Endpoint | Notes |
|---|---|
| `GET / POST /api/orders/` | list (`?status=`) / create from cart |
| `GET /api/orders/<order_number>/` | details + tracking timeline |
| `POST /api/orders/<order_number>/cancel/` | unpaid orders only, stock is returned |
| `POST /api/orders/track/` | public: `{order_number, email}` |
| `GET /api/payments/config/` · `POST initialize/` · `GET verify/<ref>/` · `POST webhook/` | |
| `GET /api/reviews/?product=<slug>` · `POST /api/reviews/` · `GET eligibility/?product=` · `GET mine/` | only customers who purchased a product can review it |
| `GET /api/store-info/` · `POST /api/contact/` · `GET /api/health/` | |

---

## 11. Admin dashboard

`/admin/` (Django admin, enhanced):

- **Home page:** revenue, orders to fulfil, awaiting payment, low-stock and out-of-stock panels, unresolved contact messages
- **Products:** thumbnails, inline image upload with previews, inline variants, list-editable price, sale price, stock and flags, stock-level badges and filters (Low / Out of stock), bulk actions (feature, restock +20, hide), SEO fields, JSON specifications
- **Categories / Brands:** create, edit and delete, feature on homepage, ordering
- **Orders:** status and payment pills, list-editable status, items and status-history inlines, bulk actions (Processing → Ready → Shipped → Delivered, mark paid manually, cancel and restock). Every status change is recorded on the customer's tracking timeline.
- **Customers:** order count, total spent, full order history and saved addresses
- **Reviews:** approve / hide (bulk) with automatic rating recalculation
- **Coupons:** create, edit, activate / deactivate, usage limits, expiry, minimum order
- **Payments, Carts, Wishlists, Contact messages:** read and manage

Inventory: `availability` is recalculated on every save (In Stock / Low Stock at or below `LOW_STOCK_THRESHOLD` / Out of Stock at 0). Customers can't add or order more than is in stock.

---

## 12. Security notes

- JWT access tokens (30 min) + rotating refresh tokens (7 days) with **blacklisting** on logout and rotation
- Django PBKDF2 password hashing and password validators
- `IsAuthenticated` / per-user querysets on every private endpoint (users only see their own carts, orders, addresses and reviews)
- **Server-side price, discount, shipping and stock validation.** Totals sent from the browser are ignored.
- `SELECT … FOR UPDATE` locking when reserving stock and confirming payments
- Paystack webhook HMAC verification; payment amount, currency and reference checks
- Rate limiting: anonymous and user throttles, stricter `auth`, `contact` and `payments` scopes
- CORS restricted to `CORS_ALLOWED_ORIGINS`; CSRF protection for the admin
- Production settings: HTTPS redirect, HSTS, secure and HTTP-only cookies, `X-Frame-Options: DENY`, no browsable API
- Secrets only via environment variables

The React app stores the refresh token in `localStorage` for simplicity. For stricter setups, move the refresh token to an HTTP-only cookie. The API client in `src/services/api.js` keeps this in one place.

---

## 13. Production deployment

### Backend (e.g. a VPS, Render, Railway)

```bash
export DJANGO_SETTINGS_MODULE=config.settings.prod
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3
```

- Set `DEBUG=False`, a strong `SECRET_KEY`, `ALLOWED_HOSTS`, `DATABASE_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, Paystack keys and SMTP settings.
- Static files (admin) are served by WhiteNoise.
- **Media files** (uploads) must be served by your web server (e.g. Nginx `location /media/ { alias /path/to/backend/media/; }`) or moved to object storage (e.g. S3 via `django-storages`).
- Put Nginx or a load balancer with HTTPS in front of Gunicorn.
- Schedule `python manage.py release_unpaid_orders` (e.g. hourly).

### Frontend (e.g. Vercel, Netlify, Nginx)

```bash
cd frontend
VITE_API_URL=https://api.yourdomain.com/api VITE_SITE_URL=https://yourdomain.com npm run build
```

Deploy `dist/` as a single-page app: all routes must fall back to `index.html` (Netlify `_redirects`: `/* /index.html 200`; Vercel rewrites; Nginx `try_files $uri /index.html;`).

### Google Maps

The contact page shows a lightweight map placeholder that opens Google Maps. To embed live maps, replace `MapPlaceholder` in `src/pages/Contact/Contact.jsx` with a Google Maps Embed API `<iframe>` using your key.

---

## 14. Before you go live — checklist

- [ ] Add the official logo files to `frontend/public/brand/` and replace the favicon
- [ ] Set the `brand` accent colour in `tailwind.config.js` to match the logo
- [ ] Run `python manage.py seed_data --clear-samples` to remove the sample reviewers, sample reviews and demo account
- [ ] Replace placeholder product images with real photos; confirm prices and stock
- [ ] Review or replace the seeded coupons (`WELCOME10`, `TIMELINE5K`)
- [ ] Review the Shipping / Returns / FAQ copy in `frontend/src/pages/Info/content.js`
- [ ] Add store phone numbers and confirm business hours in `backend/apps/core/store.py`
- [ ] Set real Paystack keys and the webhook URL; set SMTP email settings
- [ ] `DJANGO_SETTINGS_MODULE=config.settings.prod`, `DEBUG=False`, HTTPS enabled

---

© Timeline Global Systems Limited. All Rights Reserved.
