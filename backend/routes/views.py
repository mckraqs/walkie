"""Views for the routes app."""

import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from regions.models import Region
from routes.serializers import (
    RouteGenerateRequestSerializer,
    RouteSegmentSerializer,
)
from routes.services import (
    RouteGenerationError,
    RouteType,
    generate_route,
    get_route_path_names,
    get_route_segments,
)

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
        get_object_or_404(Region, pk=region_id)

        serializer = RouteGenerateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_distance_m = serializer.validated_data["target_distance_km"] * 1000
        route_type = RouteType(serializer.validated_data["route_type"])

        logger.info(
            "Route request: region_id=%d, target_distance_m=%.0f, route_type=%s",
            region_id,
            target_distance_m,
            route_type.value,
        )

        try:
            result = generate_route(region_id, target_distance_m, route_type)
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
