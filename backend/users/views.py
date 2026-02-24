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

from paths.models import Path
from regions.models import Region
from regions.serializers import RegionListItemSerializer
from users.models import FavoriteRegion, PathWalkAction, PathWalkLog
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


def _get_walked_path_ids(user: object, region: Region) -> list[int]:
    """Return the IDs of paths currently marked as walked by the user in a region.

    Uses DISTINCT ON to get the latest log entry per path, then filters for
    the "walked" action to determine the current state.

    Args:
        user: The authenticated user.
        region: The region to query.

    Returns:
        Sorted list of path IDs currently marked as walked.
    """
    latest_logs = (
        PathWalkLog.objects.filter(user=user, region=region)
        .order_by("path_id", "-created_at")
        .distinct("path_id")
    )
    walked_ids = [
        log.path_id for log in latest_logs if log.action == PathWalkAction.WALKED
    ]
    return sorted(walked_ids)


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


class PathWalkToggleView(APIView):
    """Toggle the walked state for a path within a region."""

    def post(self, request: Request, region_id: int, path_id: int) -> Response:
        """Handle POST to toggle the walked state of a path.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            path_id: The path primary key.

        Returns:
            200 with updated state, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        path = get_object_or_404(Path, pk=path_id, region=region)

        latest_log = (
            PathWalkLog.objects.filter(user=request.user, path=path)
            .order_by("-created_at")
            .first()
        )
        if latest_log is None or latest_log.action == PathWalkAction.UNWALKED:
            new_action = PathWalkAction.WALKED
        else:
            new_action = PathWalkAction.UNWALKED

        PathWalkLog.objects.create(
            user=request.user,
            path=path,
            region=region,
            action=new_action,
        )

        walked_path_ids = _get_walked_path_ids(request.user, region)
        total_paths = Path.objects.filter(region=region).count()
        return Response(
            {
                "path_id": path.pk,
                "action": new_action,
                "walked_path_ids": walked_path_ids,
                "total_paths": total_paths,
            },
            status=status.HTTP_200_OK,
        )
