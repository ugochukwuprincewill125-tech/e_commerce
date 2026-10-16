# Deploying Timeline Global Systems to Vercel

One Vercel project serves everything, using
[Vercel Services](https://vercel.com/docs/services): the React storefront
(Vite service rooted at `frontend/`) and the Django API (Django service rooted
at `backend/`) deploy together on one domain. All configuration is committed
in `vercel.json` at the repo root — there are no dashboard build settings to
maintain.

## 1. Prerequisites

- This repo pushed to GitHub
- A Postgres database (Supabase is already in use — keep using it)
- A Paystack account (secret + public keys)
- The Cloudinary credentials already used for product images

## 2. Vercel project setup (one project)

1. Push this repo to GitHub.
2. Vercel → **Add New… → Project** → import the repo.
3. Vercel detects multiple applications — choose to **group them into a
   single project using Services**. Do **not** import `frontend/` or
   `backend/` as standalone projects. Keep the Root Directory as the
   repository root.
4. Set the **Framework Preset to `Services`** — this is required: a project
   only builds as services when the project's framework is `Services` *and*
   `vercel.json` contains the `services` key. If the import wizard doesn't
   offer `Services`, pick `Other` and change it right after import in
   **Project → Settings → Build and Deployment → Framework Preset**, before
   the first deploy. Leaving it on `Vite`/`Django`/`Other` makes Vercel
   ignore the services config. Build/output/install command fields can stay
   empty — each service builds itself.
5. Add the environment variables below (**Production** + **Preview**) BEFORE
   the first deploy. The Django service loads `config.settings.prod` during
   the build and refuses to start when a required value is missing — a missing
   variable fails the build instead of shipping a broken site.
6. Deploy.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Key | Value | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | Required — Vercel discovers the Django entrypoint by running `manage.py`, which otherwise defaults to the dev settings |
| `SECRET_KEY` | a long random string | Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DATABASE_URL` | your Supabase **pooler** URI | The same URI configured in `backend/.env` |
| `DB_CONN_MAX_AGE` | `0` | Serverless: open/close per request so the Supabase pooler is never exhausted (`base.py` falls back to 60 when unset) |
| `ALLOWED_HOSTS` | `.vercel.app,yourdomain.com` | Comma-separated; the leading dot covers all subdomains (including Preview URLs) |
| `FRONTEND_URL` | `https://your-domain.vercel.app` | No trailing slash; used in emails/links |
| `CORS_ALLOWED_ORIGINS` | `https://your-domain.vercel.app` | Production is same-origin, so CORS never actually runs — harmless to keep |
| `CSRF_TRUSTED_ORIGINS` | `https://your-domain.vercel.app` | Required for Django-admin logins; add `https://*.vercel.app` to sign in from Preview URLs |
| `DJANGO_ADMIN_URL` | `django-control/` | Must match the `/django-control/*` rewrite in `vercel.json` — change both together |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` or `sk_test_…` | **Required** — prod refuses to boot without it |
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

Optional tuning variables (all have sane defaults; skip unless needed):
`THROTTLE_USER`, `THROTTLE_AUTH`, `THROTTLE_CONTACT`, `THROTTLE_PAYMENTS`,
`JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`, `LOG_LEVEL`, `SECURE_HSTS_SECONDS`,
`PAYSTACK_BASE_URL`, `EMAIL_PORT`.

Variables you do **NOT** need on Vercel: `DEBUG` (prod hard-codes it off),
`PAYMENT_TEST_MODE` (forced off in prod), `VITE_API_URL` (the storefront
defaults to same-origin `/api`) and `VITE_SITE_URL` (add it as
`https://your-domain` only if you want canonical links to show the final
domain).

## 4. First deployment — run migrations

Vercel's build does not migrate (intentionally — a failed deploy should never
migrate half-way). After the first successful deploy, run them from your
machine against the same database you configured in Vercel:

```
cd backend
# Windows PowerShell
$env:DATABASE_URL="postgresql://…pooler URI…"; .\venv\Scripts\python.exe manage.py migrate
# macOS / Linux
DATABASE_URL="postgresql://…pooler URI…" ./venv/bin/python manage.py migrate
```

(If `backend/.env` already points at that database — as it does today — plain
`.\venv\Scripts\python.exe manage.py migrate` inside `backend/` is enough.)

## 5. Post-deploy checklist

- [ ] `https://your-domain/api/health/` returns `200`
- [ ] Storefront loads; shop, product pages, cart, checkout all work
- [ ] Deep links work — open `https://your-domain/shop` directly in a tab
- [ ] Sign up a test customer; verification email arrives and the link opens the site
- [ ] Paystack **test** payment on a real checkout, then switch to live keys
- [ ] Paystack dashboard → add webhook `https://your-domain/api/payments/webhook/`
- [ ] Django admin at `https://your-domain/django-control/` — sign in, upload a product image (goes to Cloudinary)
- [ ] React admin at `https://your-domain/admin` — owner account only
- [ ] Lock down Supabase: use the **pooler** URI, restrict access in Supabase settings if possible

## 6. How it works (for future reference)

- `vercel.json` declares two services and the public routing table:
  `/api/*`, `/static/*` and `/django-control/*` → the Django service;
  everything else → the storefront, which falls back to `index.html` for
  client-side routes (SPA deep links).
- The Django service is built by Vercel's Django preset: dependencies come
  from `backend/requirements.txt`, `collectstatic` runs automatically — admin
  CSS/JS is served from Vercel's CDN at `/static/` (nothing to commit;
  `backend/staticfiles/` is gitignored) — and the WSGI entrypoint
  (`config.wsgi:application`) is declared in `vercel.json` because Services
  requires an explicit `entrypoint` for Python services.
- Product images upload through Django to Cloudinary — no local filesystem
  use.
- The API is same-origin in production, so CORS never comes into play for the
  deployed site.
