# Deploying Timeline Global Systems to Vercel

One Vercel project serves everything: the React storefront (static) and the
Django API (serverless function). All configuration is already committed —
`vercel.json` and `api/index.py` at the repo root.

## 1. Prerequisites

- This repo pushed to GitHub
- A Postgres database (Supabase is already in use — keep using it)
- A Paystack account (secret + public keys)
- The Cloudinary credentials already used for product images

## 2. Vercel project setup (one project)

1. Push this repo to GitHub.
2. Vercel → **Add New… → Project** → import the repo.
3. Framework preset: **Other** (vercel.json drives everything).
4. Leave build settings as detected from `vercel.json` — do not override.
5. Add the environment variables below (**Production** + **Preview**).
6. Deploy.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Key | Value | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | Required — `api/index.py` defaults are dev-proof but set it explicitly |
| `SECRET_KEY` | a long random string | Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DEBUG` | `False` | — |
| `DATABASE_URL` | your Supabase **pooler** URI | Same value as local `.env` (port 5432 session pooler) |
| `DB_CONN_MAX_AGE` | `60` | Reuse DB connections across invocations |
| `ALLOWED_HOSTS` | `.vercel.app,yourdomain.com` | Comma-separated; leading dot covers all subdomains |
| `FRONTEND_URL` | `https://your-domain.vercel.app` | No trailing slash; used in emails/links |
| `CORS_ALLOWED_ORIGINS` | `https://your-domain.vercel.app` | Add `https://localhost:5173` for Preview builds if needed |
| `CSRF_TRUSTED_ORIGINS` | `https://your-domain.vercel.app` | Same list as CORS |
| `DJANGO_ADMIN_URL` | e.g. `tgs-control-7x9/` | Secret path for the Django admin; bots probing `/admin/` find nothing |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` or `sk_test_…` | **Required** — prod boots without it |
| `PAYSTACK_PUBLIC_KEY` | `pk_live_…` or `pk_test_…` | Served to the checkout page |
| `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` | Real email in prod |
| `EMAIL_HOST` | e.g. `smtp.zoho.com` / `smtp.gmail.com` | — |
| `EMAIL_HOST_USER` | your SMTP username | — |
| `EMAIL_HOST_PASSWORD` | your SMTP password/app-password | — |
| `EMAIL_USE_TLS` | `True` | — |
| `DEFAULT_FROM_EMAIL` | `Timeline Global Systems <timelinegadget@gmail.com>` | — |
| `CLOUDINARY_CLOUD_NAME` | `dfn83v6jq` | Product image storage |
| `CLOUDINARY_API_KEY` | your Cloudinary key | — |
| `CLOUDINARY_API_SECRET` | your Cloudinary secret | — |
| `SECURE_SSL_REDIRECT` | `True` | — |
| `THROTTLE_ANON` | `120/min` | Optional — tighten if you like |

Variables you do **NOT** need on Vercel: `PAYMENT_TEST_MODE` (forced off in
prod), `VITE_API_URL` / `VITE_SITE_URL` (the frontend defaults to same-origin
`/api`; add `VITE_SITE_URL=https://your-domain` only if you want canonical
tags to show the final domain).

## 4. First deployment — run migrations

Vercel's build does not migrate (intentionally — a failed deploy should never
migrate half-way). After the first successful deploy, from your machine:

```bash
cd backend
DATABASE_URL="postgresql://…same-as-vercel…" ./venv/Scripts/python.exe manage.py migrate
```

Or run it inside Vercel: `vercel deploy` → then `vercel env pull` locally and
migrate. Subsequent model changes: deploy → run `migrate` → verify.

## 5. Post-deploy checklist

- [ ] `https://your-domain/api/health/` returns `200`
- [ ] Storefront loads; shop, product pages, cart, checkout all work
- [ ] Sign up a test customer; verification email arrives and the link opens the site
- [ ] Paystack **test** payment on a real checkout, then switch to live keys
- [ ] Paystack dashboard → add webhook `https://your-domain/api/payments/webhook/`
- [ ] Django admin at `https://your-domain/<DJANGO_ADMIN_URL>` — sign in, upload a product image (goes to Cloudinary)
- [ ] React admin at `https://your-domain/admin` — owner account only
- [ ] Lock down Supabase: use the **pooler** URI, restrict access in Supabase settings if possible

## 6. How it works (for future reference)

- `vercel.json` builds the frontend, collects Django static files, and routes:
  `/api/*`, `/static/*` and `/django-control/*` → the serverless function;
  everything else → `index.html` (SPA routing).
- `api/index.py` exposes the Django WSGI app with `config.settings.prod`.
- Product images upload through Django to Cloudinary — no local filesystem use.
- The API is same-origin in production, so CORS never comes into play for the
  deployed site.
