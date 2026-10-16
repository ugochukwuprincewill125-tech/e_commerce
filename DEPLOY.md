# Deploying Timeline Global Systems

Two hosts, one repository:

| Piece | Host | What runs there |
|---|---|---|
| Storefront (React + Vite SPA) | **Vercel** | static build of `frontend/`, served from Vercel's CDN |
| API (Django + DRF) | **Render** | Python web service rooted at `backend/` (gunicorn + WhiteNoise) |
| Database | Supabase | unchanged — `DATABASE_URL` |
| Product images | Cloudinary | unchanged — `CLOUDINARY_*` |

Deploy config lives in the repo: [`render.yaml`](render.yaml) and
[`frontend/vercel.json`](frontend/vercel.json). Everything else is environment
variables. Merging to `main` redeploys both hosts automatically.

> Earlier versions of this repo tried to run Django and the SPA together on
> Vercel (Services). That approach is retired — the backend runs on Render now.
> If a combined Vercel project still exists in your dashboard, delete it so it
> doesn't confuse future deploys.

## 1. Prerequisites

- This repo pushed to GitHub
- Supabase database + Cloudinary account (both already in use)
- A Paystack account — optional at first. Without keys the deploy still works
  with checkout disabled (see §6).

## 2. Backend → Render

**Recommended — create from the committed blueprint:**

1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**
   → connect this GitHub repo → review → **Apply**.
2. Render reads `render.yaml` and prompts for the secret values it must not
   store in git: `DATABASE_URL` (Supabase session-pooler URI) and the three
   `CLOUDINARY_*` values. All of them are already in `backend/.env`, and are
   listed for copy-paste in `backend/.env.render` (git-ignored).
3. The build runs `pip install` → `collectstatic` → the production settings
   boot checks. A missing or blank required value **fails the build loudly** —
   that is by design, so a misconfigured site never goes live silently.
4. You get `https://<service-name>.onrender.com` — copy it. Sanity check:
   `https://<service-name>.onrender.com/api/health/` returns `{"status": "ok"}`.
   (If the subdomain is taken, edit `name:` in `render.yaml`, push, re-apply.)

**Manual alternative:** **New → Web Service** → this repo, then:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python |
| Instance type | Free (or Starter for no cold starts) |
| Build Command | `pip install -r requirements.txt && python manage.py collectstatic --noinput` |
| Start Command | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120` |
| Health Check Path | `/api/health/` |
| Environment | every variable in `backend/.env.render` |

Notes:

- **Free tier sleeps** after ~15 minutes idle — the next request takes about a
  minute to wake it. Starter ($7/mo) keeps it always-on.
- Every push to `main` redeploys automatically (`autoDeploy`).
- Migrations are **not** run at deploy time — run them from your machine (§5).
- Uploads no longer hit Vercel's ~4.5MB request cap: Cloudinary stores the
  files, so normal product photos have no practical limit.
- With no SMTP settings, email goes to the console — verification mails appear
  in the Render **Logs** tab. Add `EMAIL_*` when you want real email.

## 3. Frontend → Vercel

1. Vercel → **Add New → Project** → import this repo.
2. Set **Root Directory = `frontend`**. If the import asks how to handle
   multiple applications, choose the root-directory option — **not** Services.
   Vercel auto-detects Vite; leave all build settings at their defaults.
3. Add environment variables (Production **and** Preview) **before** the first
   deploy — `VITE_API_URL` is baked into the bundle at build time:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<service-name>.onrender.com/api` (no trailing slash) |
   | `VITE_SITE_URL` | optional — the site's public URL, for canonical/OG tags |

4. Deploy. `frontend/vercel.json` supplies the SPA fallback (deep links like
   `/account/orders` survive a refresh) and the security headers.

## 4. Connect them

On Render → your service → **Environment**:

- `FRONTEND_URL` → `https://<your-app>.vercel.app` (used in emails and the
  Paystack callback; no trailing slash)
- `CORS_ALLOWED_ORIGINS` → the same URL. The storefront and API live on
  different domains now — without this, every API call fails with a CORS error.

Save; Render redeploys automatically. Then open the storefront and confirm:
products load (Cloudinary images), sign-in works, checkout places an order.

## 5. Migrations & admin (run from your machine)

Render builds never migrate (a failed deploy must not touch the database).
`backend/.env` already points at the same Supabase database, so:

```powershell
cd backend
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py createsuperuser
```

Admin panel: `https://<service-name>.onrender.com/django-control/` — keep the
trailing slash; `/admin/` 404s by design.

## 6. Payments (Paystack) — when you're ready

The store is fully usable without payments: checkout shows *"Online payment is
not configured yet. Please contact the store to complete your order."* and the
order is saved as unpaid.

1. Create a free account at [paystack.com](https://paystack.com) — test-mode
   API keys are available immediately (no business verification needed).
2. Render → Environment: set `PAYSTACK_SECRET_KEY` (`sk_test_…`) and
   `PAYSTACK_PUBLIC_KEY` (`pk_test_…`); delete `ALLOW_MISSING_PAYSTACK`; save.
3. Test a checkout with Paystack's test card: `4084 0840 8408 4081`, any
   future expiry, CVV `408`, PIN `0000`, OTP `123456`.
4. Paystack dashboard → Webhooks → `https://<service-name>.onrender.com/api/payments/webhook/`.
5. Before selling for real: activate the business on Paystack, swap in
   `sk_live_…` / `pk_live_…`, redeploy.

## 7. Render environment reference

| Key | Value | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | Required — otherwise Django loads dev settings |
| `PYTHON_VERSION` | `3.12.8` | Adjust if Render no longer offers it |
| `SECRET_KEY` | long random string | The blueprint generates one automatically |
| `DATABASE_URL` | Supabase session-pooler URI | Same as `backend/.env` |
| `ALLOWED_HOSTS` | `.onrender.com` | The exact Render hostname is trusted automatically too |
| `FRONTEND_URL` | `https://<app>.vercel.app` | No trailing slash |
| `CORS_ALLOWED_ORIGINS` | same as `FRONTEND_URL` | **Required** — the storefront is cross-origin now |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary console → API Keys | Required in production |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | `sk_test_…` / `pk_test_…` | Add when ready (§6) |
| `ALLOW_MISSING_PAYSTACK` | `True` | Keeps deploys working until Paystack keys exist; delete afterwards |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` | your SMTP provider | Until set, emails print to the Render logs |

**Not needed on Render:** `DEBUG` (prod hard-codes it off), `PAYMENT_TEST_MODE`
(forced off in prod), `DB_CONN_MAX_AGE` (defaults to 60 — correct for an
always-on host), `CSRF_TRUSTED_ORIGINS` (the Render origin is trusted
automatically).

Optional tuning (all have sane defaults): `THROTTLE_ANON`, `THROTTLE_USER`,
`THROTTLE_AUTH`, `THROTTLE_CONTACT`, `THROTTLE_PAYMENTS`, `JWT_ACCESS_MINUTES`,
`JWT_REFRESH_DAYS`, `LOG_LEVEL`, `SECURE_HSTS_SECONDS`, `PAYSTACK_BASE_URL`.

## 8. Post-deploy checklist

- [ ] `https://<service>.onrender.com/api/health/` → `{"status": "ok"}`
- [ ] Storefront loads; product images come from Cloudinary
- [ ] Register / sign in (check Render logs for the verification email)
- [ ] Cart → checkout → order placed; visible in the admin
- [ ] Admin: edit a product and upload an image
- [ ] Paystack set up (§6) before taking real orders
- [ ] (Optional) Custom domain: add it on Vercel + Render, then update
      `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` and `ALLOWED_HOSTS`
