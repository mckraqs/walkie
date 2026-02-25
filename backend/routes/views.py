"""Views for the routes app."""

import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from places.models import Place
from regions.models import Region
from routes.serializers import (
    RouteGenerateRequestSerializer,
    RouteSegmentSerializer,
)
from routes.services import (
    RouteGenerationError,
    RouteType,
    _find_nearest_node_at_distance,
    generate_route,
    get_route_path_names,
    get_route_segments,
)
from users.models import FavoriteRegion

logger = logging.getLogger(__name__)


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
                start_node_override = _find_nearest_node_at_distance(
                    region_id, start_place.location.x, start_place.location.y
                )

            if end_place_id is not None and route_type == RouteType.ONE_WAY:
                end_place = get_object_or_404(
                    Place, pk=end_place_id, user=request.user, region=region
                )
                end_node_override = _find_nearest_node_at_distance(
                    region_id, end_place.location.x, end_place.location.y
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
                {"detail": str(exc)},
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
            }
        )
