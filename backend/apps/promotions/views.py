from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.pricing import build_quote
from apps.cart.services import get_cart


class ApplyCouponSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=40)
    state = serializers.CharField(max_length=80, required=False, allow_blank=True)
    delivery_method = serializers.ChoiceField(choices=["delivery", "pickup"], required=False, default="delivery")


class ApplyCouponView(APIView):
    """
    POST /api/coupons/apply/  {code, state?, delivery_method?}
    Validates the coupon against the *server-side* cart and returns the
    recalculated totals. Nothing sent from the browser is trusted for pricing.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ApplyCouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = get_cart(request, create=False)
        if not cart or not cart.items.exists():
            return Response({"detail": "Your cart is empty."}, status=status.HTTP_400_BAD_REQUEST)
        quote = build_quote(
            cart,
            coupon_code=serializer.validated_data["code"],
            state=serializer.validated_data.get("state", ""),
            delivery_method=serializer.validated_data["delivery_method"],
        )
        if not quote["coupon"]["valid"]:
            return Response({"detail": quote["coupon"]["message"], "quote": quote}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": quote["coupon"]["message"], "quote": quote})
