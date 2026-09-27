from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.orders.models import OrderItem, PaymentStatus
from apps.products.models import Product

from .models import Review
from .serializers import ReviewSerializer


def has_purchased(user, product):
    return OrderItem.objects.filter(
        order__user=user, order__payment_status=PaymentStatus.PAID, product=product
    ).exists()


class ReviewViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    GET    /api/reviews/?product=<slug>        approved reviews for a product
    POST   /api/reviews/ {product, rating, title?, comment}
                                               only customers who bought (and paid for) the product
    GET    /api/reviews/eligibility/?product=<slug>
    GET    /api/reviews/mine/                  the signed-in customer's reviews
    DELETE /api/reviews/<id>/                  delete your own review
    """

    serializer_class = ReviewSerializer
    ordering_fields = ["created_at", "rating"]
    ordering = ("-created_at",)

    def get_permissions(self):
        if self.action == "list":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Review.objects.select_related("user", "product")
        if self.action == "list":
            qs = qs.filter(is_approved=True)
            slug = self.request.query_params.get("product")
            if slug:
                qs = qs.filter(product__slug=slug)
            rating = self.request.query_params.get("rating")
            if rating and rating.isdigit():
                qs = qs.filter(rating=int(rating))
            return qs
        return qs.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data["product"]
        if not has_purchased(request.user, product):
            return Response(
                {"detail": "Only customers who have purchased this product can review it."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if Review.objects.filter(user=request.user, product=product).exists():
            return Response({"detail": "You've already reviewed this product."}, status=status.HTTP_400_BAD_REQUEST)
        review = serializer.save(user=request.user, is_verified_purchase=True)
        message = "Thanks! Your review has been published." if review.is_approved else "Thanks! Your review will appear once approved."
        data = self.get_serializer(review).data
        data["detail"] = message
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def eligibility(self, request):
        product = Product.objects.filter(slug=request.query_params.get("product", "")).first()
        if not product:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if Review.objects.filter(user=request.user, product=product).exists():
            return Response({"can_review": False, "reason": "You've already reviewed this product."})
        if not has_purchased(request.user, product):
            return Response({"can_review": False, "reason": "Reviews are open to customers who purchased this product."})
        return Response({"can_review": True, "reason": ""})

    @action(detail=False, methods=["get"])
    def mine(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)
