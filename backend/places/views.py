"""Views for the places app."""

from django.contrib.gis.geos import Point
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from places.models import Place
from places.serializers import (
    PlaceCreateSerializer,
    PlaceSerializer,
    PlaceUpdateSerializer,
)
from regions.models import Region
from users.models import FavoriteRegion


class PlaceListCreateView(APIView):
    """List and create places for a region."""

    def get(self, request: Request, region_id: int) -> Response:
        """List all places for the authenticated user in a region.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.

        Returns:
            200 with list of places, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        places = Place.objects.filter(user=request.user, region=region).order_by("name")
        return Response(PlaceSerializer(places, many=True).data)

    def post(self, request: Request, region_id: int) -> Response:
        """Create a new place in a region.

        Args:
            request: The authenticated HTTP request with name and location.
            region_id: The region primary key.

        Returns:
            201 with created place, or 403/404/422.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PlaceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lon, lat = serializer.validated_data["location"]
        point = Point(lon, lat, srid=4326)

        if not region.boundary.contains(point):
            return Response(
                {"detail": "Location is outside the region boundary."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        place = Place.objects.create(
            user=request.user,
            region=region,
            name=serializer.validated_data["name"],
            location=point,
        )
        return Response(PlaceSerializer(place).data, status=status.HTTP_201_CREATED)


class PlaceDetailView(APIView):
    """Update and delete a specific place."""

    def patch(self, request: Request, region_id: int, place_id: int) -> Response:
        """Update a place's name and/or location.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            place_id: The place primary key.

        Returns:
            200 with updated place, or 403/404/422.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        place = get_object_or_404(Place, pk=place_id, user=request.user, region=region)
        serializer = PlaceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if "name" in serializer.validated_data:
            place.name = serializer.validated_data["name"]

        if "location" in serializer.validated_data:
            lon, lat = serializer.validated_data["location"]
            point = Point(lon, lat, srid=4326)
            if not region.boundary.contains(point):
                return Response(
                    {"detail": "Location is outside the region boundary."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            place.location = point

        place.save()
        return Response(PlaceSerializer(place).data)

    def delete(self, request: Request, region_id: int, place_id: int) -> Response:
        """Delete a place.

        Args:
            request: The authenticated HTTP request.
            region_id: The region primary key.
            place_id: The place primary key.

        Returns:
            204 on success, or 403/404.
        """
        region = get_object_or_404(Region, pk=region_id)
        if not FavoriteRegion.objects.filter(user=request.user, region=region).exists():
            return Response(
                {"detail": "Access restricted to your favorite regions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        place = get_object_or_404(Place, pk=place_id, user=request.user, region=region)
        place.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
