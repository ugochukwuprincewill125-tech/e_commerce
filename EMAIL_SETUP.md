# Transactional email setup (Brevo)

The store sends every transactional email through **Brevo** (`POST /v3/smtp/email`),
with the durable outbox in `backend/apps/notifications/`. Each message is stored
before delivery with a unique idempotency key, so a repeated webhook or event
can never email a customer twice, a provider failure is retryable, and
development can inspect exactly what would have been sent.

This guide gets you from zero to working email **today, with no custom domain**,
and shows what changes when the real domain is ready (only Brevo domain
authentication + env vars — no code).

---

## 1. What is sent automatically

| Trigger | Template | Idempotency key |
|---|---|---|
| Registration | `welcome` (includes the verify button) **and** `verify_email` | `welcome:<user>`, `verify-email:<user>:<link hash>` |
| Resend verification / customer changes email | `verify_email` | `verify-email:<user>:<link hash>` |
| Password reset request | `password_reset` | `password-reset:<user>:<link hash>` |
| Checkout (order placed) | `order_confirmation` | `order-confirmation:<order>` |
| Payment confirmed (Paystack callback/webhook or staff) | `payment_confirmation` — includes the receipt code and receipt link | `payment-confirmation:<order>:<reference>` |
| Staff moves the order to **processing** | `order_processing` | `order-status:<order>:processing` |
| Staff moves the order to **ready for delivery** | `order_ready` (delivery wording) | `order-status:<order>:ready_for_delivery` |
| Staff moves the order to **ready for pickup** | `order_ready` (pickup wording, store address/hours) | `order-status:<order>:ready_for_pickup` |
| Staff marks an order **shipped** | `order_shipped` | `order-status:<order>:shipped` |
| Staff marks an order **delivered** / **picked up** | `order_delivered` — thanks + review links for each item | `order-status:<order>:<status>` |
| Order cancelled (customer, staff, or expiry) | `order_cancelled` | `order-cancelled:<order>` |
| Refund recorded (Paystack webhook or staff) | `order_refunded` | `order-refund:<order>:<refund id/reference>` |

`placed` and `payment_confirmed` do not send a separate status email: checkout
sends `order_confirmation`, and a verified payment sends `payment_confirmation`
(the receipt), so those transitions are already covered. Every other
customer-visible status change in the delivery and pickup timelines sends
exactly one email, even if staff move an order backward and forward again.

Payment-confirmation emails are only generated after the payment is verified
server-side (Paystack callback/webhook signature + amount/currency/reference
match) or a staff member deliberately confirms it — never from browser-reported
success.

---

## 2. Environment variables

| Variable | Purpose | Local default | Production |
|---|---|---|---|
| `BREVO_API_KEY` | Brevo API key (`xkeysib-…`). Server only. | empty | set it on Render |
| `BREVO_SENDER_NAME` | Display name on every email | `Timeline Gadgets` | same |
| `BREVO_SENDER_EMAIL` | Verified sender address | `timelinegadget@gmail.com` | same until the domain is authenticated |
| `BREVO_REPLY_TO_EMAIL` | Reply-To address | same as sender | same |
| `BREVO_API_URL` | Brevo API base URL | `https://api.brevo.com/v3` | leave |
| `BREVO_API_TIMEOUT` | Request timeout (seconds) | `15` | leave |
| `EMAIL_TEST_MODE` | Redirect/suppress instead of sending to customers | `True` in dev | forced `False` |
| `EMAIL_TEST_RECIPIENT` | Where test-mode mail goes | empty → console only | leave empty |
| `EMAIL_MAX_ATTEMPTS` | Outbox attempt ceiling | `5` | leave |
| `EMAIL_IMMEDIATE_ATTEMPTS` | Immediate retries inside the request | `2` | leave |
| `EMAIL_RETRY_AFTER_MINUTES` | Delay before the scheduled retry sweep | `10` | leave |

If `BREVO_API_KEY` is empty, delivery falls back to Django's email backend
(`EMAIL_BACKEND`/`EMAIL_*` — console in local development), so the store keeps
working before Brevo is configured.

> **Safety:** `config/settings/prod.py` forces `EMAIL_TEST_MODE = False`.
> In development it defaults to `True`, so a developer can never email real
> customers by accident. Test mode still renders and stores the full message
> (marked `[TEST]` and with a yellow banner) and redirects it to
> `EMAIL_TEST_RECIPIENT`; with no recipient set it is printed to the terminal.

---

## 3. Brevo account setup without a domain (today)

1. Create a free account at <https://app.brevo.com> (300 emails/day free).
2. **Verify the sender address** — no domain needed:
   *Brevo → Senders, Domains & Dedicated IPs → Senders → Add a sender.*
   Use `timelinegadget@gmail.com` (the default) or another address you own.
   Brevo emails a confirmation code; click it.
   *This single-sender method works until you own a domain: Brevo allows free
   Gmail addresses as senders, but deliverability is best once the domain is
   authenticated (section 6).*
3. **Create an API key** — *Brevo → SMTP & API → API Keys → Generate a new API
   key* with the "Send transactional email" access. Copy the `xkeysib-…` value.
4. Put it in `backend/.env`:

   ```env
   BREVO_API_KEY=xkeysib-...
   BREVO_SENDER_EMAIL=timelinegadget@gmail.com
   # While testing, point test mode at your own inbox so Brevo really sends.
   # Leave empty to capture messages in the terminal instead.
   EMAIL_TEST_RECIPIENT=you@example.com
   ```

5. Restart the server and send a test message (section 4).
6. In production (Render → Environment), set `BREVO_API_KEY` and keep
   `BREVO_SENDER_EMAIL` equal to the verified sender. The blueprint already
   defines the other Brevo variables. Production forces
   `EMAIL_TEST_MODE=False`, so never set `EMAIL_TEST_RECIPIENT` there.

---

## 4. Testing it

```powershell
cd backend

# Send one diagnostic email through the exact production path.
# With EMAIL_TEST_RECIPIENT=you@example.com this actually goes through Brevo
# (subject prefixed [TEST]); with it empty the message is only printed.
.\venv\Scripts\python.exe manage.py send_test_email you@example.com

# Retry anything pending/failed (the scheduled workflow calls the endpoint version).
.\venv\Scripts\python.exe manage.py retry_failed_emails --limit 50
.\venv\Scripts\python.exe manage.py retry_failed_emails --dry-run
```

> **Receiving real mail locally:** set `EMAIL_TEST_RECIPIENT` to an inbox you
> control. Every customer email (registration, password reset, orders, status
> changes) is then delivered there through Brevo, marked `[TEST]` and with the
> intended customer shown in a banner — nothing reaches real customers.
> To verify delivery to an actual customer address, temporarily set
> `EMAIL_TEST_MODE=False` in `backend/.env` (development only; production
> always forces it off).

Then exercise the real triggers:

1. Register a new account → a welcome email **and** a verification email, both with a verify button.
2. Order something → `order_confirmation`.
3. Pay (Paystack test keys, or simulated checkout without keys) → `payment_confirmation`, which now includes the receipt code.
4. In the admin panel, move the order through **Processing → Ready for Delivery → Shipped → Delivered** → one email per step; the delivered email thanks the customer and links each item for a review.
5. Move a pickup order through **Processing → Ready for Pickup → Picked Up** → the ready email shows the store address and opening hours, and the picked-up email thanks the customer and asks for a review.
6. Cancel another order → `order_cancelled`.
7. Mark a paid order refunded (or send a Paystack `refund.processed` webhook) → `order_refunded`.

Everything is visible in **Admin panel → Transactional email**: rendered HTML
preview, plain-text body, status, provider message id, attempts, last error, and
whether the message ran in test mode. Failed messages can be retried from the
row action.

### Automated tests

```powershell
.\venv\Scripts\python.exe -m pytest apps/notifications -q
```

These cover deduplication, test mode, provider payload/error classification,
retries, template rendering, and the registration → order → payment → every
fulfilment status → refund event flow. The test settings force
`BREVO_API_KEY=""` and Django's in-memory backend, so the suite can never call
Brevo or send real mail.

---

## 5. Production notes

* `EMAIL_TEST_MODE` is forced off in `config/settings/prod.py`; with
  `BREVO_API_KEY` set, mail goes to customers.
* The scheduled workflow (`.github/workflows/maintenance.yml`) calls
  `POST /api/emails/maintenance/retry/` hourly next to the payment/order upkeep
  to sweep anything a Brevo hiccup left pending. It needs `MAINTENANCE_TOKEN`
  set on Render **and** as a GitHub repo secret (same token as the other
  maintenance endpoints).
* Brevo free tier: 300 emails/day, 100/day before account activation. If the
  store outgrows it, the only change is the Brevo plan.

---

## 6. Moving to the real domain (later)

No code changes — only Brevo configuration and one env var:

1. Buy the domain and add it in **Brevo → Senders, Domains & Dedicated IPs →
   Domains → Add a domain**.
2. Add the DNS records Brevo shows (SPF/DKIM; DMARC is recommended) at your DNS
   provider and click **Authenticate**. This usually takes minutes to a few
   hours.
3. Set the new sender on Render and in `backend/.env`:

   ```env
   BREVO_SENDER_EMAIL=orders@timelinegadgets.com
   BREVO_REPLY_TO_EMAIL=support@timelinegadgets.com
   BREVO_SENDER_NAME=Timeline Gadgets
   ```

4. Send a test (`manage.py send_test_email`) and retire the old sender in Brevo.

The whole codebase reads the sender from settings, so templates, links and
delivery need no edit.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Brevo rejected email … status=401` | Wrong/revoked API key. Regenerate it in Brevo and update `BREVO_API_KEY`. |
| `status=400 … "sender … is not valid"` | `BREVO_SENDER_EMAIL` is not verified in Brevo. Verify it in *Senders* (or use the address that is). |
| Messages stay **Pending** | Brevo unreachable or rate-limited (429/5xx). They are retried automatically by the scheduled sweep; check the row's `last_error`. |
| Nothing arrives but the admin shows **Sent** | Check the recipient's spam folder, then verify SPF/DKIM by authenticating the domain (section 6). Gmail senders have limited reputation. |
| A test-mode message was expected in a real inbox | `EMAIL_TEST_RECIPIENT` is empty — the message was captured in the console. Set the address and resend from the admin. |
| Duplicate-safe behaviour | The outbox key prevents duplicates; a message is never sent twice for the same order/reference/refund id, even across webhook redeliveries. |
