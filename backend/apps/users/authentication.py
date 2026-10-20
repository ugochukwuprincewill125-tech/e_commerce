"""JWT authentication with an email-verification gate.

Customers must confirm their email address before any authenticated API can be
used. Staff accounts are exempt so an administrator created in Django admin is
never locked out of store management before verifying their address.
"""
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class VerifiedEmailJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, _token = result
        if not user.email_verified and not user.is_staff:
            raise AuthenticationFailed(
                {
                    "detail": "Please verify your email address before continuing.",
                    "code": "email_not_verified",
                }
            )
        return result
