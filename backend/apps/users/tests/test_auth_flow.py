"""End-to-end authentication flow: verification, resend and Google sign-in."""
from unittest.mock import Mock, patch

import pytest
from django.contrib.auth import get_user_model
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.tokens import AccessToken

from apps.notifications.models import TransactionalEmail
from apps.users.tokens import email_verification_token

User = get_user_model()

REGISTER = "/api/auth/register/"
LOGIN = "/api/auth/login/"
VERIFY = "/api/auth/verify-email/"
RESEND = "/api/auth/resend-verification/"
GOOGLE = "/api/auth/google/"
DASHBOARD = "/api/users/dashboard/"

PASSWORD = "StrongPass123!"
PAYLOAD = {
    "first_name": "Ada",
    "last_name": "Okafor",
    "email": "ada.okafor@example.com",
    "phone": "08031234567",
    "password": PASSWORD,
    "confirm_password": PASSWORD,
}


def make_user(**overrides):
    data = {
        "email": "customer@example.com",
        "first_name": "Test",
        "last_name": "Customer",
        "password": PASSWORD,
    }
    data.update(overrides)
    return User.objects.create_user(**data)


def verification_args(user):
    return {
        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "token": email_verification_token.make_token(user),
    }


def google_claims(**overrides):
    claims = {
        "aud": "test-client.apps.googleusercontent.com",
        "iss": "https://accounts.google.com",
        "email": "google.customer@example.com",
        "email_verified": True,
        "sub": "google-sub-123",
        "given_name": "Grace",
        "family_name": "Okafor",
        "name": "Grace Okafor",
        "exp": 4102444800,
    }
    claims.update(overrides)
    return claims


def tokeninfo_response(claims):
    response = Mock(status_code=200)
    response.json.return_value = claims
    return response


@pytest.mark.django_db
class TestRegistrationVerificationFlow:
    def test_registration_does_not_return_tokens_and_leaves_email_unverified(self, api_client):
        resp = api_client.post(REGISTER, PAYLOAD, format="json")

        assert resp.status_code == 201
        assert "access" not in resp.data
        assert "refresh" not in resp.data
        user = User.objects.get(email=PAYLOAD["email"])
        assert user.email_verified is False

    def test_unverified_login_is_blocked_with_a_specific_code(self, api_client):
        make_user(email="unverified@example.com", email_verified=False)

        resp = api_client.post(
            LOGIN,
            {"email": "unverified@example.com", "password": PASSWORD},
            format="json",
        )

        assert resp.status_code == 401
        assert resp.data["code"] == "email_not_verified"
        assert "verify your email" in resp.data["detail"].lower()

    def test_unverified_token_cannot_reach_the_dashboard(self, api_client):
        user = make_user(email="blocked@example.com", email_verified=False)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

        resp = api_client.get(DASHBOARD)

        assert resp.status_code == 401
        assert resp.data["code"] == "email_not_verified"

    def test_verifying_the_email_allows_login_and_dashboard(self, api_client):
        user = make_user(email="verify-me@example.com", email_verified=False)

        verified = api_client.post(VERIFY, verification_args(user), format="json")
        assert verified.status_code == 200
        user.refresh_from_db()
        assert user.email_verified is True

        login = api_client.post(
            LOGIN,
            {"email": "verify-me@example.com", "password": PASSWORD},
            format="json",
        )
        assert login.status_code == 200
        assert login.data["access"]
        assert login.data["user"]["email_verified"] is True

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        assert api_client.get(DASHBOARD).status_code == 200

    def test_resend_is_public_and_only_queues_for_unverified_accounts(self, api_client):
        make_user(email="needs-link@example.com", email_verified=False)
        make_user(email="already-ok@example.com", email_verified=True)

        resend = api_client.post(RESEND, {"email": "needs-link@example.com"}, format="json")
        assert resend.status_code == 200
        assert "if that email address" in resend.data["detail"].lower()

        already = api_client.post(RESEND, {"email": "already-ok@example.com"}, format="json")
        assert already.status_code == 200

        assert TransactionalEmail.objects.filter(
            template="verify_email", recipient_email="needs-link@example.com"
        ).count() == 1
        assert not TransactionalEmail.objects.filter(
            template="verify_email", recipient_email="already-ok@example.com"
        ).exists()

    def test_password_reset_email_works_end_to_end(self, api_client):
        import re

        user = make_user(email="reset-me@example.com", email_verified=True)
        requested = api_client.post(
            "/api/auth/password-reset/", {"email": user.email}, format="json"
        )
        assert requested.status_code == 200

        record = TransactionalEmail.objects.get(
            template="password_reset", recipient_email=user.email
        )
        match = re.search(r"/reset-password/([^/\s\"<]+)/([^/\s\"<]+)", record.html_body)
        assert match, "reset link missing from the email"
        uid, token = match.groups()

        new_password = "BrandNewPass456!"
        confirmed = api_client.post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": new_password,
                "confirm_password": new_password,
            },
            format="json",
        )
        assert confirmed.status_code == 200

        old = api_client.post(
            LOGIN, {"email": user.email, "password": PASSWORD}, format="json"
        )
        assert old.status_code == 401

        new = api_client.post(
            LOGIN, {"email": user.email, "password": new_password}, format="json"
        )
        assert new.status_code == 200
        assert new.data["access"]

    def test_a_verified_staff_member_is_not_locked_out(self, api_client):
        staff = make_user(
            email="staff@example.com",
            email_verified=False,
            is_staff=True,
        )
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(staff)}")

        assert api_client.get("/api/admin-api/stats/").status_code == 200


@pytest.mark.django_db
class TestGoogleAuth:
    @pytest.fixture(autouse=True)
    def configured(self, settings):
        settings.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"

    def test_google_creates_a_verified_customer_and_returns_tokens(self, api_client):
        with patch(
            "apps.users.serializers.requests.get",
            return_value=tokeninfo_response(google_claims()),
        ):
            resp = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")

        assert resp.status_code == 201, resp.data
        assert resp.data["access"]
        user = User.objects.get(email="google.customer@example.com")
        assert user.email_verified is True
        assert user.google_sub == "google-sub-123"
        assert resp.data["user"]["email_verified"] is True
        welcome = TransactionalEmail.objects.get(
            template="welcome", recipient_email=user.email
        )
        assert "/verify-email/" not in welcome.html_body
        assert "verify your email" not in welcome.subject.lower()

    def test_repeated_google_sign_in_reuses_the_same_account(self, api_client):
        response = tokeninfo_response(google_claims())
        with patch("apps.users.serializers.requests.get", return_value=response):
            first = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")
            second = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")

        assert first.status_code == 201
        assert second.status_code == 200
        assert User.objects.filter(email="google.customer@example.com").count() == 1
        assert TransactionalEmail.objects.filter(template="welcome").count() == 1

    def test_changed_google_email_keeps_the_same_account(self, api_client):
        first_response = tokeninfo_response(google_claims())
        changed_response = tokeninfo_response(
            google_claims(email="grace.changed@example.com")
        )
        with patch(
            "apps.users.serializers.requests.get",
            side_effect=[first_response, changed_response],
        ):
            first = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")
            changed = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")

        assert first.status_code == 201
        assert changed.status_code == 200
        assert User.objects.filter(google_sub="google-sub-123").count() == 1
        user = User.objects.get(google_sub="google-sub-123")
        assert user.email == "grace.changed@example.com"
        assert TransactionalEmail.objects.filter(template="welcome").count() == 1

    def test_google_links_an_existing_password_account(self, api_client):
        existing = make_user(
            email="google.customer@example.com",
            email_verified=False,
        )
        with patch(
            "apps.users.serializers.requests.get",
            return_value=tokeninfo_response(google_claims()),
        ):
            resp = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")

        assert resp.status_code == 200
        existing.refresh_from_db()
        assert existing.google_sub == "google-sub-123"
        assert existing.email_verified is True

    def test_wrong_audience_is_rejected(self, api_client):
        with patch(
            "apps.users.serializers.requests.get",
            return_value=tokeninfo_response(google_claims(aud="someone-else")),
        ):
            resp = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")

        assert resp.status_code == 400
        assert not User.objects.filter(email="google.customer@example.com").exists()

    def test_unverified_google_email_is_rejected(self, api_client):
        with patch(
            "apps.users.serializers.requests.get",
            return_value=tokeninfo_response(google_claims(email_verified=False)),
        ):
            resp = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")

        assert resp.status_code == 400
        assert not User.objects.filter(email="google.customer@example.com").exists()

    def test_google_is_unavailable_when_client_id_is_missing(self, api_client, settings):
        settings.GOOGLE_CLIENT_ID = ""
        resp = api_client.post(GOOGLE, {"credential": "fake-id-token"}, format="json")
        assert resp.status_code == 400
        assert "not configured" in resp.data["detail"].lower()
