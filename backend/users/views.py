"""Views for the users app."""

from typing import ClassVar

from django.contrib.gis.db.models.functions import Length
from django.db import transaction
from django.db.models import Case, F, FloatField, QuerySet, Sum, Value, When
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from paths.models import Path, PathSegment
from places.models import Place
from regions.models import Region
from regions.serializers import RegionListItemSerializer
from routes.models import Route
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
        """Remove a region from favorites and delete associated user data.

        Deletes all routes and places the user created in the region,
        then removes the favorite. All deletions run in a single transaction.

        Args:
            request: The authenticated HTTP request.
            pk: The region primary key.

        Returns:
            200 with deletion counts, or 404 if not in favorites.
        """
        region = get_object_or_404(Region, pk=pk)
        favorite = FavoriteRegion.objects.filter(
            user=request.user, region=region
        ).first()
        if not favorite:
            return Response(status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            routes_deleted, _ = Route.objects.filter(
                user=request.user, region=region
            ).delete()
            places_deleted, _ = Place.objects.filter(
                user=request.user, region=region
            ).delete()
            favorite.delete()

        return Response(
            {"routes_deleted": routes_deleted, "places_deleted": places_deleted},
            status=status.HTTP_200_OK,
        )


def _get_walked_path_ids(user: object, region: Region) -> list[int]:
    """Return IDs of paths where at least half the segment length is walked.

    Named paths (non-empty name) are aggregated by street name so that
    multiple Path records for the same street are evaluated together.
    Unnamed paths are evaluated individually to avoid grouping unrelated paths.

    Args:
        user: The authenticated user.
        region: The region to query.

    Returns:
        Sorted list of path IDs meeting the coverage threshold.
    """
    walked_routes = Route.objects.filter(user=user, region=region, walked=True)
    walked_segment_ids: set[int] = set()
    for route in walked_routes:
        walked_segment_ids.update(route.segment_ids)

    if not walked_segment_ids:
        return []

    walked_length_expr = Coalesce(
        Sum(
            Case(
                When(
                    segment_id__in=walked_segment_ids,
                    then=Length("segment__geometry"),
                ),
            ),
        ),
        Value(0.0),
        output_field=FloatField(),
    )

    # Named paths: aggregate by street name across sibling Path records.
    named_coverage = (
        PathSegment.objects.filter(path__region=region)
        .exclude(path__name="")
        .values("path__name")
        .annotate(
            total_length=Sum(Length("segment__geometry")),
            walked_length=walked_length_expr,
        )
        .filter(walked_length__gte=F("total_length") / 2)
    )
    walked_names = [row["path__name"] for row in named_coverage]
    named_ids = list(
        Path.objects.filter(region=region, name__in=walked_names).values_list(
            "id", flat=True
        )
    )

    # Unnamed paths: evaluate each Path record individually.
    unnamed_coverage = (
        PathSegment.objects.filter(path__region=region, path__name="")
        .values("path_id")
        .annotate(
            total_length=Sum(Length("segment__geometry")),
            walked_length=walked_length_expr,
        )
        .filter(walked_length__gte=F("total_length") / 2)
    )
    unnamed_ids = [row["path_id"] for row in unnamed_coverage]

    return sorted(set(named_ids) | set(unnamed_ids))


class WalkedPathsListView(APIView):
    """Return paths the user has currently marked as walked in a region."""

    def get(self, request: Request, region_id: int) -> Response:
        """Handle GET to return walked path IDs for a region.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.

        Returns:
            200 with walked_path_ids and total_paths, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        walked_path_ids = _get_walked_path_ids(request.user, region)
        total_paths = Path.objects.filter(region=region).count()
        return Response(
            {"walked_path_ids": walked_path_ids, "total_paths": total_paths},
            status=status.HTTP_200_OK,
        )
