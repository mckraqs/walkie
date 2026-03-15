"""Views for the routes app."""

import logging

from django.contrib.gis.geos import Point
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from paths.models import Segment
from places.models import Place
from regions.models import Region
from routes.models import Route
from routes.serializers import (
    RouteCreateSerializer,
    RouteGenerateRequestSerializer,
    RouteListItemSerializer,
    RouteRenameSerializer,
    RouteSegmentSerializer,
)
from routes.services import (
    RouteGenerationError,
    RouteType,
    _find_random_node_near_place,
    build_gpx_xml,
    build_kml_xml,
    generate_route,
    get_route_path_names,
    get_route_segments,
)
from users.models import FavoriteRegion
from users.views import _get_walked_paths

logger = logging.getLogger(__name__)

MAX_SAVED_ROUTES_PER_REGION = 25


def _validate_coords_in_region(region: Region, lon: float, lat: float) -> None:
    """Raise RouteGenerationError if the point falls outside the region boundary."""
    point = Point(lon, lat, srid=4326)
    if not region.boundary.contains(point):
        raise RouteGenerationError("Selected point is outside the region boundary.")


class RouteGenerateView(APIView):
    """Generate a walking route in a region."""

    def post(self, request: Request, region_id: int) -> Response:
        """Handle POST request to generate a route.

        Args:
            request: The HTTP request with target_distance_km.
            region_id: The region to generate a route in.

        Returns:
            Response with route data or error details.
        """
        region = get_object_or_404(Region, pk=region_id)

        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Route generation is restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RouteGenerateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_distance_m = serializer.validated_data["target_distance_km"] * 1000
        route_type = RouteType(serializer.validated_data["route_type"])

        start_place_id = serializer.validated_data.get("start_place_id")
        end_place_id = serializer.validated_data.get("end_place_id")
        start_coords = serializer.validated_data.get("start_coords")
        end_coords = serializer.validated_data.get("end_coords")

        logger.info(
            "Route request: region_id=%d, target_distance_m=%.0f, route_type=%s",
            region_id,
            target_distance_m,
            route_type.value,
        )

        try:
            start_node_override = None
            end_node_override = None

            if start_place_id is not None:
                start_place = get_object_or_404(
                    Place, pk=start_place_id, user=request.user, region=region
                )
                start_node_override = _find_random_node_near_place(
                    region_id, start_place.location.x, start_place.location.y
                )
            elif start_coords is not None:
                _validate_coords_in_region(region, start_coords[0], start_coords[1])
                start_node_override = _find_random_node_near_place(
                    region_id, start_coords[0], start_coords[1]
                )

            if end_place_id is not None and route_type == RouteType.ONE_WAY:
                end_place = get_object_or_404(
                    Place, pk=end_place_id, user=request.user, region=region
                )
                end_node_override = _find_random_node_near_place(
                    region_id, end_place.location.x, end_place.location.y
                )
            elif end_coords is not None and route_type == RouteType.ONE_WAY:
                _validate_coords_in_region(region, end_coords[0], end_coords[1])
                end_node_override = _find_random_node_near_place(
                    region_id, end_coords[0], end_coords[1]
                )

            result = generate_route(
                region_id,
                target_distance_m,
                route_type,
                start_node_override=start_node_override,
                end_node_override=end_node_override,
            )
        except RouteGenerationError as exc:
            logger.warning("Route generation failed: %s", exc)
            return Response(
                {"detail": "Route generation failed. Please try different parameters."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        segments_qs = get_route_segments(result.segment_ids)
        segments_data = RouteSegmentSerializer(segments_qs, many=True).data
        path_names = get_route_path_names(result.segment_ids)

        logger.info(
            "Route success: %d segments, %.0fm",
            len(result.segment_ids),
            result.total_distance,
        )

        return Response(
            {
                "total_distance": result.total_distance,
                "is_loop": result.is_loop,
                "start_point": list(result.start_point) if result.start_point else None,
                "end_point": list(result.end_point) if result.end_point else None,
                "segments": segments_data,
                "paths_count": len(path_names),
                "path_names": path_names,
                "used_shortest_path": result.used_shortest_path,
            }
        )


class RouteListCreateView(APIView):
    """List and create saved routes for a region."""

    def get(self, request: Request, region_id: int) -> Response:
        """List all saved routes for the authenticated user in a region.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.

        Returns:
            200 with list of saved routes, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        routes = Route.objects.filter(user=request.user, region=region)
        return Response(RouteListItemSerializer(routes, many=True).data)

    def post(self, request: Request, region_id: int) -> Response:
        """Save a new route in a region.

        Args:
            request: The authenticated HTTP request with route data.
            region_id: The region primary key.

        Returns:
            201 with created route summary, or 400/403/404/409.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RouteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        segment_ids = serializer.validated_data["segment_ids"]
        is_custom = serializer.validated_data["is_custom"]

        existing_count = Segment.objects.filter(
            pk__in=segment_ids, region=region
        ).count()
        if existing_count != len(set(segment_ids)):
            return Response(
                {"detail": "One or more segment IDs do not belong to this region."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        route_count = Route.objects.filter(user=request.user, region=region).count()
        if route_count >= MAX_SAVED_ROUTES_PER_REGION:
            return Response(
                {
                    "detail": (
                        f"Maximum of {MAX_SAVED_ROUTES_PER_REGION} "
                        "saved routes per region reached."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        route = Route.objects.create(
            user=request.user,
            region=region,
            name=serializer.validated_data["name"],
            segment_ids=segment_ids,
            total_distance=serializer.validated_data["total_distance"],
            is_loop=serializer.validated_data["is_loop"],
            is_custom=is_custom,
            walked=serializer.validated_data["walked"],
            start_point=serializer.validated_data.get("start_point"),
            end_point=serializer.validated_data.get("end_point"),
        )
        response_data = RouteListItemSerializer(route).data
        if route.walked:
            result = _get_walked_paths(request.user, region)
            response_data["walked_path_ids"] = result.path_ids
            response_data["partially_walked_path_ids"] = (
                result.partially_walked_path_ids
            )
            response_data["total_paths"] = result.total_count
            response_data["walked_count"] = result.walked_count
        return Response(response_data, status=status.HTTP_201_CREATED)


class RouteDetailView(APIView):
    """Retrieve or delete a specific saved route."""

    def get(self, request: Request, region_id: int, route_id: int) -> Response:
        """Retrieve a saved route with full segment data.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            route_id: The saved route primary key.

        Returns:
            200 with route data (same shape as RouteGenerateView), or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        route = get_object_or_404(Route, pk=route_id, user=request.user, region=region)

        segments_qs = get_route_segments(route.segment_ids)
        segments_data = RouteSegmentSerializer(segments_qs, many=True).data
        path_names = get_route_path_names(route.segment_ids)

        return Response(
            {
                "total_distance": route.total_distance,
                "is_loop": route.is_loop,
                "start_point": route.start_point,
                "end_point": route.end_point,
                "segments": segments_data,
                "paths_count": len(path_names),
                "path_names": path_names,
            }
        )

    def patch(self, request: Request, region_id: int, route_id: int) -> Response:
        """Rename a saved route.

        Args:
            request: The authenticated HTTP request with the new name.
            region_id: The region primary key.
            route_id: The saved route primary key.

        Returns:
            200 with updated route summary, or 400/403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        route = get_object_or_404(Route, pk=route_id, user=request.user, region=region)

        serializer = RouteRenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        route.name = serializer.validated_data["name"]
        route.save(update_fields=["name"])

        return Response(RouteListItemSerializer(route).data)

    def delete(self, request: Request, region_id: int, route_id: int) -> Response:
        """Delete a saved route.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            route_id: The saved route primary key.

        Returns:
            204 on success, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        route = get_object_or_404(Route, pk=route_id, user=request.user, region=region)
        route.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RouteWalkToggleView(APIView):
    """Toggle the walked status of a saved route."""

    def post(self, request: Request, region_id: int, route_id: int) -> Response:
        """Toggle walked on a saved route.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            route_id: The saved route primary key.

        Returns:
            200 with updated walked status, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        route = get_object_or_404(Route, pk=route_id, user=request.user, region=region)
        route.walked = not route.walked
        route.save(update_fields=["walked"])

        result = _get_walked_paths(request.user, region)

        return Response(
            {
                "id": route.id,
                "walked": route.walked,
                "walked_path_ids": result.path_ids,
                "partially_walked_path_ids": result.partially_walked_path_ids,
                "total_paths": result.total_count,
                "walked_count": result.walked_count,
            }
        )


class RouteExportView(APIView):
    """Export a saved route as GPX or KML."""

    def get(self, request: Request, region_id: int, route_id: int) -> HttpResponse:
        """Export a saved route in GPX or KML format.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            route_id: The saved route primary key.

        Returns:
            File download response with GPX or KML content.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        route = get_object_or_404(Route, pk=route_id, user=request.user, region=region)

        export_format = request.query_params.get("export_format", "gpx").lower()
        if export_format not in ("gpx", "kml"):
            return Response(
                {"detail": "Invalid format. Use 'gpx' or 'kml'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        segments = get_route_segments(route.segment_ids)

        if export_format == "kml":
            xml_content = build_kml_xml(route.name, segments)
            content_type = "application/vnd.google-earth.kml+xml"
            extension = "kml"
        else:
            xml_content = build_gpx_xml(route.name, segments)
            content_type = "application/gpx+xml"
            extension = "gpx"

        safe_name = (
            route.name.replace('"', "")
            .replace("\\", "")
            .replace("\r", "")
            .replace("\n", "")
        )
        response = HttpResponse(xml_content, content_type=content_type)
        response["Content-Disposition"] = (
            f'attachment; filename="{safe_name}.{extension}"'
        )
        return response
