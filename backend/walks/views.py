"""Views for the walks app."""

import json

from django.contrib.gis.geos import GEOSGeometry
from django.db import connection
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from regions.models import Region
from routes.models import Route
from routes.services import (
    match_segments_to_geometry,
    stitch_segment_coordinates_from_ids,
)
from users.models import FavoriteRegion
from users.views import _get_walked_paths
from walks.models import Walk
from walks.serializers import (
    WalkCreateSerializer,
    WalkDetailSerializer,
    WalkListItemSerializer,
    WalkUpdateSerializer,
)


def _compute_geometry_distance(geometry: GEOSGeometry) -> float:
    """Compute the length of a geometry in meters using ST_Length(::geography)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT ST_Length(%s::geography)", [geometry.ewkt])
        row = cursor.fetchone()
    return float(row[0]) if row and row[0] else 0.0


class WalkListCreateView(APIView):
    """List and create walks for a region."""

    def get(self, request: Request, region_id: int) -> Response:
        """List all walks for the authenticated user in a region.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.

        Returns:
            200 with list of walks, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        walks = Walk.objects.filter(user=request.user, region=region)
        return Response(WalkListItemSerializer(walks, many=True).data)

    def post(self, request: Request, region_id: int) -> Response:
        """Create a new walk in a region.

        Args:
            request: The authenticated HTTP request with walk data.
            region_id: The region primary key.

        Returns:
            201 with created walk and updated progress, or 400/403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = WalkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        route_id = serializer.validated_data.get("route_id")
        geometry_data = serializer.validated_data.get("geometry")

        if route_id is not None:
            route = get_object_or_404(
                Route, pk=route_id, user=request.user, region=region
            )
            if route.custom_geometry:
                geometry = route.custom_geometry
            else:
                coords = stitch_segment_coordinates_from_ids(route.segment_ids)
                if not coords:
                    return Response(
                        {"detail": "Could not construct geometry from route segments."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                geometry = GEOSGeometry(
                    json.dumps({"type": "LineString", "coordinates": coords}),
                    srid=4326,
                )
            segment_ids = list(route.segment_ids)
        else:
            geometry = GEOSGeometry(json.dumps(geometry_data), srid=4326)
            match_result = match_segments_to_geometry(
                region_id, json.dumps(geometry_data)
            )
            segment_ids = match_result.segment_ids

        distance = _compute_geometry_distance(geometry)

        walk = Walk.objects.create(
            user=request.user,
            region=region,
            name=serializer.validated_data["name"],
            geometry=geometry,
            segment_ids=segment_ids,
            walked_at=serializer.validated_data["walked_at"],
            distance=distance,
        )

        result = _get_walked_paths(request.user, region)
        response_data = WalkListItemSerializer(walk).data
        response_data["walked_path_ids"] = result.path_ids
        response_data["partially_walked_path_ids"] = result.partially_walked_path_ids
        response_data["total_paths"] = result.total_count
        response_data["walked_count"] = result.walked_count

        return Response(response_data, status=status.HTTP_201_CREATED)


class WalkDetailView(APIView):
    """Retrieve, rename, or delete a specific walk."""

    def get(self, request: Request, region_id: int, walk_id: int) -> Response:
        """Retrieve a walk with full geometry.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            walk_id: The walk primary key.

        Returns:
            200 with walk data including geometry, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        walk = get_object_or_404(Walk, pk=walk_id, user=request.user, region=region)
        return Response(WalkDetailSerializer(walk).data)

    def patch(self, request: Request, region_id: int, walk_id: int) -> Response:
        """Update a walk's name and/or date.

        Args:
            request: The authenticated HTTP request with updated fields.
            region_id: The region primary key.
            walk_id: The walk primary key.

        Returns:
            200 with updated walk data, or 400/403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        walk = get_object_or_404(Walk, pk=walk_id, user=request.user, region=region)
        serializer = WalkUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        update_fields = ["name"]
        walk.name = serializer.validated_data["name"]

        if "walked_at" in serializer.validated_data:
            walk.walked_at = serializer.validated_data["walked_at"]
            update_fields.append("walked_at")

        walk.save(update_fields=update_fields)

        return Response(WalkListItemSerializer(walk).data)

    def delete(self, request: Request, region_id: int, walk_id: int) -> Response:
        """Delete a walk.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            walk_id: The walk primary key.

        Returns:
            204 on success, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        walk = get_object_or_404(Walk, pk=walk_id, user=request.user, region=region)
        walk.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
