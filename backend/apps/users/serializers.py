from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Address
from .tokens import email_verification_token

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "first_name", "last_name", "full_name", "email", "phone",
            "profile_image", "email_verified", "date_joined", "is_staff",
        )
        read_only_fields = ("id", "email_verified", "date_joined", "is_staff")


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

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "phone", "password", "confirm_password")
        extra_kwargs = {"email": {"validators": []}}

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        candidate = User(email=attrs["email"], first_name=attrs["first_name"], last_name=attrs["last_name"])
        validate_password(attrs["password"], user=candidate)
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(TokenObtainPairSerializer):
    """Email + password login that also returns the user profile."""

    def validate(self, attrs):
        attrs[self.username_field] = attrs.get(self.username_field, "").lower()
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


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
