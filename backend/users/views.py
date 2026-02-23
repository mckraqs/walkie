"""Views for the users app."""

from typing import ClassVar

from django.db.models import QuerySet, Value
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from regions.models import Region
from regions.serializers import RegionListItemSerializer
from users.models import FavoriteRegion
from users.serializers import LoginSerializer, UserSerializer


class LoginView(APIView):
    """Authenticate a user and return a token."""

    authentication_classes: ClassVar[list[type]] = []
    permission_classes: ClassVar = [AllowAny]

    def post(self, request: Request) -> Response:
        """Handle POST to authenticate and return a token.

        Args:
            request: The HTTP request with username and password.

        Returns:
            Response with token and user data, or 400 on failure.
        """
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = serializer.validated_data["user"]  # type: ignore[index]
        token, _ = Token.objects.get_or_create(user=user)  # type: ignore[attr-defined]
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """Delete the current user's auth token."""

    authentication_classes: ClassVar = [TokenAuthentication]
    permission_classes: ClassVar = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        """Handle POST to delete the auth token.

        Args:
            request: The authenticated HTTP request.

        Returns:
            204 response with no content.
        """
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Return the current authenticated user's info."""

    permission_classes: ClassVar = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        """Handle GET to return the current user.

        Args:
            request: The authenticated HTTP request.

        Returns:
            Response with user id and username.
        """
        return Response(UserSerializer(request.user).data)


class FavoriteRegionListView(generics.ListAPIView):
    """Return the authenticated user's favorited regions."""

    serializer_class = RegionListItemSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Region]:  # type: ignore[override]
        """Return regions favorited by the current user."""
        return (
            Region.objects.filter(favorited_by__user=self.request.user)
            .only(
                "id",
                "code",
                "name",
                "administrative_district_lvl_1",
                "administrative_district_lvl_2",
            )
            .annotate(_is_favorite=Value(True))
            .order_by("administrative_district_lvl_1", "name")
        )


class FavoriteRegionToggleView(APIView):
    """Add or remove a region from the authenticated user's favorites."""

    def post(self, request: Request, pk: int) -> Response:
        """Add a region to favorites.

        Args:
            request: The authenticated HTTP request.
            pk: The region primary key.

        Returns:
            201 if added, 409 if already a favorite, 404 if region not found.
        """
        region = get_object_or_404(Region, pk=pk)
        _, created = FavoriteRegion.objects.get_or_create(
            user=request.user, region=region
        )
        if not created:
            return Response(
                {"detail": "Region is already in favorites."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {"detail": "Region added to favorites."},
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request: Request, pk: int) -> Response:
        """Remove a region from favorites.

        Args:
            request: The authenticated HTTP request.
            pk: The region primary key.

        Returns:
            204 if removed, 404 if not in favorites.
        """
        region = get_object_or_404(Region, pk=pk)
        deleted, _ = FavoriteRegion.objects.filter(
            user=request.user, region=region
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
