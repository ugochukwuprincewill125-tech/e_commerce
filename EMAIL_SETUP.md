# Transactional email setup (Brevo)

The store sends every transactional email through **Brevo** (`POST /v3/smtp/email`),
with the durable outbox in `backend/apps/notifications/`. Each message is stored
before delivery with a unique idempotency key, so a repeated webhook or event
can never email a customer twice, a provider failure is retryable, and
development can inspect exactly what would have been sent.

This guide gets you from zero to working email. A Gmail sender can deliver
while testing, but the production store should authenticate its own domain
(section 6) for reliable inbox placement.

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
| Unpaid order 15 minutes after checkout | `payment_reminder` - states the one-hour deadline before automatic deletion | `payment-reminder:<order>` |
| Unpaid order deleted after the reminder grace period | `order_auto_deleted` - explains the deletion and invites a new order | `order-auto-deleted:<order>` |
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
| `BREVO_SENDER_EMAIL` | Verified sender address | `timelinegadgets4@gmail.com` | use an address on the authenticated domain |
| `BREVO_REPLY_TO_EMAIL` | Reply-To address | same as sender | same |
| `BREVO_API_URL` | Brevo API base URL | `https://api.brevo.com/v3` | leave |
| `BREVO_API_TIMEOUT` | Request timeout (seconds) | `15` | leave |
| `EMAIL_TEST_MODE` | Redirect/suppress instead of sending to customers | `True` in dev | forced `False` |
| `EMAIL_TEST_RECIPIENT` | Where test-mode mail goes | empty → console only | leave empty |
| `EMAIL_MAX_ATTEMPTS` | Outbox attempt ceiling | `5` | leave |
| `EMAIL_IMMEDIATE_ATTEMPTS` | Immediate retries inside the request | `2` | leave |
| `EMAIL_RETRY_AFTER_MINUTES` | Delay before the scheduled retry sweep | `10` | leave |
| `EMAIL_REQUIRE_REAL_PROVIDER` | Refuse to record console-only output as a successful send | `False` | forced `True` |

If `BREVO_API_KEY` is empty, development can fall back to Django's email
backend (`EMAIL_BACKEND`/`EMAIL_*`). Production sets
`EMAIL_REQUIRE_REAL_PROVIDER=True`, so a missing Brevo key and a console
backend produce a visible failed outbox row instead of a false "Sent" status.

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
   Use `timelinegadgets4@gmail.com` (the default) or another address you own.
   Brevo emails a confirmation code; click it.
   *This single-sender method works until you own a domain: Brevo allows free
   Gmail addresses as senders, but deliverability is best once the domain is
   authenticated (section 6).*
3. **Create an API key** — *Brevo → SMTP & API → API Keys → Generate a new API
   key* with the "Send transactional email" access. Copy the `xkeysib-…` value.
4. Put it in `backend/.env`:

   ```env
   BREVO_API_KEY=xkeysib-...
   BREVO_SENDER_EMAIL=timelinegadgets4@gmail.com
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

# Check the provider, sender-domain authentication and recent outbox health.
# This also prints the DNS records Brevo still needs for the store domain.
.\venv\Scripts\python.exe manage.py email_health

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
8. Place an order without paying → after 15 minutes the scheduled sweep sends
   `payment_reminder`; one hour after that it sends `order_auto_deleted` and
   removes the order. In development, run
   `python manage.py process_unpaid_orders` to exercise it immediately.

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
* `GET /api/health/` reports the email state next to the liveness status:
  which provider would be used, whether test mode is on, the sender and its
  domain, and how many messages failed. It never exposes a key, an address or
  a message body.
* `python manage.py check` warns (`notifications.W001`–`W003`) when no real
  provider is configured or the sender is a free-mailbox address. The Render
  build runs it, so a misconfigured deploy says so in the build log.
* Failed transactional email is retried by a Render cron job
  (`retry_failed_emails`, every 10 minutes) and by the scheduled workflow
  (`.github/workflows/maintenance.yml`) that calls
  `POST /api/emails/maintenance/retry/` hourly next to the payment/order
  upkeep. The endpoint needs `MAINTENANCE_TOKEN` set on Render **and** as a
  GitHub repo secret (same token as the other maintenance endpoints).
* Brevo free tier: 300 emails/day, 100/day before account activation. If the
  store outgrows it, the only change is the Brevo plan.

---

## 6. Authenticating `timelinegadgets.com`

The domain is already added in Brevo, but it is **not authenticated** until its
DNS records exist. Until then the store keeps sending from a Gmail address,
and this is exactly why customers receive nothing:

* Brevo rewrites a free-mailbox sender to a shared `…@brevosend.com` address,
  so the customer sees a stranger's address in the From field;
* the rewritten message does not pass SPF/DKIM for the domain in the From
  header — a delivered probe showed `spf=false, dkim=false` at the receiving
  server — and Gmail only accepts mail that authenticates for the From domain,
  so it drops the message instead of delivering it;
* the outbox still says **Sent**, because the provider accepted the message
  for delivery. "Sent" means "handed to the provider", not "in the inbox".

Authenticating the store's own domain fixes all three at once: Brevo signs
with the domain's DKIM key, SPF and DMARC align, and the From address is a
real, branded one.

1. Add these DNS records at the DNS provider that hosts `timelinegadgets.com`
   (currently Vercel DNS). `python manage.py email_health` prints the same
   list with the live values:

   | Type | Host | Value |
   |---|---|---|
   | CNAME | `brevo1._domainkey` | `b1.timelinegadgets-com.dkim.brevo.com` |
   | CNAME | `brevo2._domainkey` | `b2.timelinegadgets-com.dkim.brevo.com` |
   | TXT | `@` | `brevo-code:e98268df11a6859f05c1c0be32983cc3` |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
   | TXT | `@` | `v=spf1 include:spf.brevo.com ~all` |

   If the provider refuses two TXT records at `@`, merge the SPF value and the
   `brevo-code` value into one record separated by a space.
2. In **Brevo → Senders, Domains & Dedicated IPs → Domains**, click
   **Authenticate** for `timelinegadgets.com`. DNS can take a few minutes to a
   few hours to propagate; rerun `email_health` until `Authenticated: yes`.
3. Change the sender on Render and in `backend/.env` to an address at the
   authenticated domain, keeping a monitored Reply-To:

   ```env
   BREVO_SENDER_EMAIL=no-reply@timelinegadgets.com
   BREVO_REPLY_TO_EMAIL=timelinegadgets4@gmail.com
   BREVO_SENDER_NAME=Timeline Gadgets
   ```

   An authenticated domain needs no separate sender verification — any address
   on it can be used. `render.yaml` already ships these values.
4. Redeploy, run `manage.py send_test_email you@example.com`, then check
   **Brevo → Transactional → Logs** for the `delivered` event. Activate the new
   sender in Brevo if the UI asks you to verify it.

The whole codebase reads the sender from settings, so templates, links and
delivery need no edit. Until step 3 is done, the application warns about it:
`manage.py check` reports `notifications.W003`, the server log repeats the
reason on every send, and `GET /api/health/` shows
`"sender_is_free_mailbox": true` with a `warning` next to it.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Brevo rejected email … status=401` | Wrong/revoked API key. Regenerate it in Brevo and update `BREVO_API_KEY`. |
| `status=400 … "sender … is not valid"` | `BREVO_SENDER_EMAIL` is not verified in Brevo. Verify it in *Senders* (or use the address that is). |
| Messages stay **Pending** | Brevo unreachable or rate-limited (429/5xx). They are retried automatically by the scheduled sweep; check the row's `last_error`. |
| Nothing arrives but the admin shows **Sent** | The provider accepted the message, but the receiving mailbox never got it. Check the From address of the delivered message: a `…@brevosend.com` sender means the domain is not authenticated, so SPF/DKIM do not align and Gmail drops the message. Fix it with section 6. `manage.py email_health` and `GET /api/health/` both report the sender state. |
| The customer sees a stranger's address in the From field | Same cause as above: Brevo rewrites an unauthenticated sender to its shared `brevosend.com` domain. Authenticate `timelinegadgets.com` and set `BREVO_SENDER_EMAIL` to it. |
| A test-mode message was expected in a real inbox | `EMAIL_TEST_RECIPIENT` is empty — the message was captured in the console. Set the address and resend from the admin. |
| Duplicate-safe behaviour | The outbox key prevents duplicates; a message is never sent twice for the same order/reference/refund id, even across webhook redeliveries. |
