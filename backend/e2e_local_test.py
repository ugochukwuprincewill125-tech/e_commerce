"""One-shot E2E test against the LIVE local stack (backend on :8000).

Covers every customer flow wired into the UI:
  1. register            -> must NOT return tokens (must not be signed in)
  2. welcome + verification emails actually enqueued
  3. login before verify  -> 401 code=email_not_verified
  4. verify email with the emailed uid/token
  5. login after verify   -> 200 + tokens + profile
  6. dashboard access with the access token
  7. logout (refresh blacklist)
  8. forgot password      -> emailed reset link -> confirm -> old pw rejected, new pw accepted
  9. contact form         -> 201, ContactMessage row, email copy enqueued to CONTACT_NOTIFICATION_EMAIL
 10. refresh token rotation
"""
import re
import sys
import urllib.error
import urllib.request
import uuid

BASE = "http://localhost:8000/api"
PASS_MARK = []
FAIL_MARK = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = __import__("json").dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def expect(name, condition, detail=""):
    if condition:
        PASS_MARK.append(name)
        print(f"  PASS  {name}")
    else:
        FAIL_MARK.append(name)
        print(f"  FAIL  {name}  {detail}")


def extract(pattern, text):
    m = re.search(pattern, text.replace("\r", ""))
    return m.group(0) if m else None


def django_setup():
    import os
    import django

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    django.setup()


django_setup()
import json

from apps.core.models import ContactMessage
from apps.notifications.models import TransactionalEmail
from apps.users.models import User

email = f"e2e-{uuid.uuid4().hex[:10]}@example.com"
password = "S3cure-Passw0rd!"
new_password = "N3w-S3cure-Pass!"

print(f"== E2E against {BASE} with {email} ==")

# 1. Register ------------------------------------------------------------------
status, body = call("POST", "/auth/register/", {
    "first_name": "E2E", "last_name": "Tester", "email": email,
    "phone": "+2348012345678", "password": password, "confirm_password": password,
})
print(f"[register] status={status} body={body[:500]!r}")
expect("register returns 201", status == 201, f"{status}: {body[:200]}")
try:
    reg = json.loads(body)
    expect("register responds with JSON", True)
except json.JSONDecodeError:
    reg = {}
    expect("register responds with JSON", False, body[:300])
expect("register does NOT return tokens", "access" not in reg)

user = User.objects.filter(email__iexact=email).first()
expect("user row created unverified", user is not None and not user.email_verified)

# 2. Emails queued --------------------------------------------------------------
queued = TransactionalEmail.objects.filter(recipient_email__iexact=email)
templates = set(queued.values_list("template", flat=True))
expect("welcome email queued", "welcome" in templates, str(templates))
expect("verification email queued", "verify_email" in templates, str(templates))
verify_email_row = queued.filter(template="verify_email").first()
verify_url = extract(r"http://localhost:5173/verify-email/[\w\-]+/[\w\-]+", verify_email_row.text_body) if verify_email_row else None
expect("verification email contains a verify link", bool(verify_url), "no link found in text_body")
uid, token = re.search(r"/verify-email/([\w\-]+)/([\w\-]+)", verify_url).groups()

# 3. Login BEFORE verification blocked ------------------------------------------
status, body = call("POST", "/auth/login/", {"email": email, "password": password})
expect("login before verify is rejected", status == 401, f"{status}: {body[:200]}")
expect("rejection carries email_not_verified code", '"code":"email_not_verified"' in body.replace(" ", ""), body[:300])

# 4. Verify email ----------------------------------------------------------------
status, body = call("POST", "/auth/verify-email/", {"uid": uid, "token": token})
expect("verify-email accepts emailed uid/token", status == 200, f"{status}: {body[:200]}")

# 5. Login AFTER verification ------------------------------------------------
status, body = call("POST", "/auth/login/", {"email": email, "password": password})
expect("login after verify returns 200", status == 200, f"{status}: {body[:200]}")
toks = json.loads(body)
access, refresh = toks.get("access"), toks.get("refresh")
expect("login returns tokens + profile", bool(access and refresh and toks.get("user", {}).get("email_verified") is True))

# 6. Dashboard -------------------------------------------------------------------
status, body = call("GET", "/users/dashboard/", token=access)
expect("dashboard accessible with verified token", status == 200, f"{status}: {body[:200]}")

# 7. Logout ----------------------------------------------------------------------
status, body = call("POST", "/auth/logout/", {"refresh": refresh}, token=access)
expect("logout blacklists refresh token", status == 200, f"{status}: {body[:200]}")

# 8. Forgot password flow --------------------------------------------------------
status, body = call("POST", "/auth/password-reset/", {"email": email})
expect("password reset request returns 200", status == 200, f"{status}: {body[:200]}")
reset_row = TransactionalEmail.objects.filter(template="password_reset", recipient_email__iexact=email).first()
reset_url = extract(r"http://localhost:5173/reset-password/[\w\-]+/[\w\-]+", reset_row.text_body) if reset_row else None
expect("reset link emailed", bool(reset_url), "no reset link in outbox")
uid, token = re.search(r"/reset-password/([\w\-]+)/([\w\-]+)", reset_url).groups()
status, body = call("POST", "/auth/password-reset/confirm/", {
    "uid": uid, "token": token, "new_password": new_password, "confirm_password": new_password,
})
expect("reset confirm works", status == 200, f"{status}: {body[:200]}")
status, _ = call("POST", "/auth/login/", {"email": email, "password": password})
expect("old password rejected after reset", status == 401, str(status))
status, body = call("POST", "/auth/login/", {"email": email, "password": new_password})
expect("new password works", status == 200, f"{status}: {body[:200]}")

# 9. Contact form ----------------------------------------------------------------
cstatus, cbody = call("POST", "/contact/", {
    "name": "E2E Customer", "email": "customer@example.com", "phone": "+2348012345678",
    "subject": "E2E wiring test", "message": "This is an automated end-to-end test of the contact form.",
})
expect("contact form returns 201", cstatus == 201, f"{cstatus}: {cbody[:200]}")
cm = ContactMessage.objects.filter(subject="E2E wiring test").order_by("-id").first()
expect("contact message stored for admin Messages tab", cm is not None)
copy = TransactionalEmail.objects.filter(template="contact_message", metadata__contact_message_id=cm.pk).first()
expect("contact email copy enqueued to team inbox", copy is not None and copy.recipient_email == "timelinegadgets4@gmail.com", str(copy.recipient_email if copy else "none"))

# 10. Refresh rotation ---------------------------------------------------------
status, body = call("POST", "/auth/login/", {"email": email, "password": new_password})
refresh = json.loads(body).get("refresh") if status == 200 else ""
status, body = call("POST", "/auth/refresh/", {"refresh": refresh})
expect("refresh rotates tokens", status == 200 and "access" in body, f"{status}: {body[:200]}")

print(f"\n== RESULT: {len(PASS_MARK)} passed, {len(FAIL_MARK)} failed ==")
if FAIL_MARK:
    print("FAILED:", *FAIL_MARK, sep="\n  - ")
    sys.exit(1)
print("ALL E2E CHECKS PASSED")
