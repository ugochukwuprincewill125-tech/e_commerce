from django.contrib.auth import get_user_model
from rest_framework import generics, parsers, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .emails import send_password_reset_email, send_verification_email
from .models import Address
from .serializers import (
    AddressSerializer,
    ChangePasswordSerializer,
    EmailSerializer,
    LoginSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)

User = get_user_model()


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_verification_email(user)
        return Response(
            {
                "detail": "Account created. We've sent a verification link to your email.",
                "user": UserSerializer(user, context={"request": request}).data,
                **tokens_for(user),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_scope = "auth"


class RefreshView(TokenRefreshView):
    throttle_scope = "auth"


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            pass  # already expired/blacklisted — the client is logged out either way
        return Response({"detail": "You have been logged out."}, status=status.HTTP_200_OK)


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        return Response({"detail": "Your email address has been verified."})


class ResendVerificationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        if request.user.email_verified:
            return Response({"detail": "Your email is already verified."})
        send_verification_email(request.user)
        return Response({"detail": "A new verification link has been sent to your email."})


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = EmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user:
            send_password_reset_email(user)
        # Same response either way so the endpoint can't be used to discover accounts.
        return Response({"detail": "If an account exists for that email, a reset link is on its way."})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Your password has been reset. You can now sign in."})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password updated successfully.", **tokens_for(request.user)})


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        return UserSerializer if self.request.method == "GET" else ProfileUpdateSerializer

    def update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        super().update(request, *args, **kwargs)
        return Response(UserSerializer(request.user, context={"request": request}).data)


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        was_default = instance.is_default
        instance.delete()
        if was_default:
            nxt = Address.objects.filter(user=self.request.user).first()
            if nxt:
                nxt.is_default = True
                nxt.save()


class DashboardView(APIView):
    """Overview numbers for the customer dashboard."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.orders.models import Order
        from apps.orders.serializers import OrderListSerializer
        from apps.wishlist.models import Wishlist

        orders = Order.objects.filter(user=request.user)
        recent = orders.prefetch_related("items")[:5]
        return Response(
            {
                "total_orders": orders.count(),
                "pending_orders": orders.exclude(status__in=["delivered", "cancelled"]).count(),
                "delivered_orders": orders.filter(status="delivered").count(),
                "wishlist_count": Wishlist.objects.filter(user=request.user).count(),
                "address_count": request.user.addresses.count(),
                "recent_orders": OrderListSerializer(recent, many=True, context={"request": request}).data,
            }
        )
