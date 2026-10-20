import logging
import time

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.db import IntegrityError, transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Address
from .tokens import email_verification_token

User = get_user_model()
logger = logging.getLogger(__name__)

GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "first_name", "last_name", "full_name", "email", "phone",
            "profile_image", "email_verified", "date_joined", "is_staff",
            # Read-only, and only used by the admin UI to decide whether to
            # offer the "grant staff access" control. The server still enforces
            # the rule — this only stops the button appearing for non-owners.
            "is_superuser",
        )
        read_only_fields = ("id", "email_verified", "date_joined", "is_staff", "is_superuser")


class ProfileUpdateSerializer(serializers.ModelSerializer):
    remove_profile_image = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "phone", "profile_image", "remove_profile_image")
        extra_kwargs = {"email": {"validators": []}}

    def validate_email(self, value):
        value = value.lower()
        if User.objects.exclude(pk=self.instance.pk).filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_profile_image(self, value):
        if value and value.size > 3 * 1024 * 1024:
            raise serializers.ValidationError("Profile image must be 3MB or smaller.")
        return value

    def update(self, instance, validated_data):
        if validated_data.pop("remove_profile_image", False):
            instance.profile_image.delete(save=False)
            instance.profile_image = None
        email_changed = "email" in validated_data and validated_data["email"] != instance.email
        instance = super().update(instance, validated_data)
        if email_changed:
            instance.email_verified = False
            instance.save(update_fields=["email_verified"])
            from .emails import send_verification_email

            send_verification_email(instance)
        return instance


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    confirm_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    # The model allows a blank phone so staff-created accounts and older rows
    # stay valid, but self-registration must collect one — every field on the
    # form is required. Declaring it here overrides the model's ``blank=True``.
    phone = serializers.RegexField(
        r"^\+?[0-9\s\-()]{7,20}$",
        error_messages={"invalid": "Enter a valid phone number."},
    )

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "phone", "password", "confirm_password")
        extra_kwargs = {"email": {"validators": []}}

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists. Please use a different email address."
            )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        candidate = User(email=attrs["email"], first_name=attrs["first_name"], last_name=attrs["last_name"])
        validate_password(attrs["password"], user=candidate)
        return attrs

    def create(self, validated_data):
        try:
            return User.objects.create_user(**validated_data)
        except IntegrityError:
            # A second request slipped past validate_email before the first
            # commit landed. Surface the same friendly message rather than a 500.
            raise serializers.ValidationError(
                {"email": "An account with this email already exists. Please use a different email address."}
            )


class LoginSerializer(TokenObtainPairSerializer):
    """Email + password login that also returns the user profile."""

    def validate(self, attrs):
        attrs[self.username_field] = attrs.get(self.username_field, "").lower()
        data = super().validate(attrs)
        if not self.user.email_verified and not self.user.is_staff:
            raise AuthenticationFailed(
                {
                    "detail": (
                        "Please verify your email address before signing in. "
                        "We can send you a new verification link."
                    ),
                    "code": "email_not_verified",
                }
            )
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


def _google_profile(credential):
    """Validate a Google ID token and return its claims.

    Google's tokeninfo endpoint verifies the signature and expiry server-side.
    We additionally pin the audience, issuer and verified-email claim so a
    token minted for another application can never sign a customer in here.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise serializers.ValidationError(
            "Google sign-in is not configured yet. Please use email and password."
        )

    try:
        response = requests.get(
            settings.GOOGLE_TOKENINFO_URL,
            params={"id_token": credential},
            timeout=settings.GOOGLE_API_TIMEOUT,
        )
    except requests.RequestException:
        logger.warning("Google token verification request failed (network error).")
        raise serializers.ValidationError(
            "Google sign-in is temporarily unavailable. Please try again."
        ) from None

    if response.status_code != 200:
        raise serializers.ValidationError(
            "Google could not verify this sign-in. Please try again."
        )

    try:
        payload = response.json()
    except ValueError:
        raise serializers.ValidationError(
            "Google could not verify this sign-in. Please try again."
        ) from None

    if payload.get("aud") != settings.GOOGLE_CLIENT_ID:
        logger.warning("Google token audience did not match GOOGLE_CLIENT_ID.")
        raise serializers.ValidationError("This Google sign-in was not issued for this site.")

    if payload.get("iss") not in GOOGLE_ISSUERS:
        raise serializers.ValidationError("This Google sign-in is not valid.")

    verified = payload.get("email_verified")
    if verified is not True and str(verified).lower() not in {"true", "1"}:
        raise serializers.ValidationError(
            "Google has not verified this email address. Verify it with Google first."
        )

    if not payload.get("email") or not payload.get("sub"):
        raise serializers.ValidationError("Google did not return an email address for this account.")

    try:
        expired = int(payload.get("exp", 0)) <= int(time.time())
    except (TypeError, ValueError):
        expired = True
    if expired:
        raise serializers.ValidationError("This Google sign-in has expired. Please try again.")

    return payload


class GoogleAuthSerializer(serializers.Serializer):
    """Exchange a Google Identity Services credential for our own JWT pair."""

    credential = serializers.CharField(write_only=True)

    def validate(self, attrs):
        profile = _google_profile(attrs["credential"])
        email = profile["email"].strip().lower()
        sub = str(profile["sub"])

        given_name = (profile.get("given_name") or "").strip()
        family_name = (profile.get("family_name") or "").strip()
        if not given_name or not family_name:
            parts = (profile.get("name") or "").strip().split()
            given_name = given_name or (parts[0] if parts else "Customer")
            family_name = family_name or (" ".join(parts[1:]) if len(parts) > 1 else "Account")

        created = False
        try:
            with transaction.atomic():
                # Match the stable Google subject first. Looking up by email
                # alone would orphan the account if the customer changes their
                # Google address and then collide with the unique google_sub.
                user = User.objects.select_for_update().filter(google_sub=sub).first()
                if user is None:
                    user = User.objects.select_for_update().filter(email__iexact=email).first()

                if user is None:
                    user = User.objects.create_user(
                        email=email,
                        first_name=given_name[:80],
                        last_name=family_name[:80],
                        email_verified=True,
                        google_sub=sub,
                    )
                    created = True
                else:
                    if not user.is_active:
                        raise AuthenticationFailed(
                            "This account has been disabled. Please contact support.",
                            code="account_disabled",
                        )
                    if user.google_sub and user.google_sub != sub:
                        raise AuthenticationFailed(
                            "This email is linked to a different Google account. "
                            "Sign in with your password instead.",
                            code="google_account_mismatch",
                        )

                    update_fields = []
                    if not user.google_sub:
                        user.google_sub = sub
                        update_fields.append("google_sub")
                    if user.email.lower() != email:
                        if (
                            User.objects.exclude(pk=user.pk)
                            .filter(email__iexact=email)
                            .exists()
                        ):
                            raise AuthenticationFailed(
                                "Another account already uses this email address.",
                                code="email_in_use",
                            )
                        user.email = email
                        update_fields.append("email")
                    if not user.email_verified:
                        # Google has already confirmed ownership of the address.
                        user.email_verified = True
                        update_fields.append("email_verified")
                    if not user.first_name:
                        user.first_name = given_name[:80]
                        update_fields.append("first_name")
                    if not user.last_name:
                        user.last_name = family_name[:80]
                        update_fields.append("last_name")
                    if update_fields:
                        user.save(update_fields=update_fields)

                if created:
                    from .emails import send_welcome_email

                    send_welcome_email(user)
        except IntegrityError:
            # Two simultaneous first sign-ins for the same Google account (or
            # an email that was claimed between our lookup and the insert).
            raise serializers.ValidationError(
                "Google sign-in could not be completed. Please try again."
            ) from None

        attrs["user"] = user
        attrs["created"] = created
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField()


class UidTokenSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    token_generator = default_token_generator

    def validate(self, attrs):
        try:
            pk = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=pk, is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError("This link is invalid or has expired.")
        if not self.token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError("This link is invalid or has expired.")
        attrs["user"] = user
        return attrs


class VerifyEmailSerializer(UidTokenSerializer):
    token_generator = email_verification_token


class PasswordResetConfirmSerializer(UidTokenSerializer):
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        validate_password(attrs["new_password"], user=attrs["user"])
        return attrs


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = (
            "id", "label", "first_name", "last_name", "phone", "address", "city",
            "state", "country", "postal_code", "is_default", "created_at",
        )
        read_only_fields = ("id", "created_at")
