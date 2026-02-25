"""Serializers for the routes app."""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from paths.models import Segment


class RouteGenerateRequestSerializer(serializers.Serializer):
    """Validate a route generation request."""

    target_distance_km = serializers.FloatField(min_value=0.1, max_value=50.0)
    route_type = serializers.ChoiceField(
        choices=["one_way", "loop"],
        default="one_way",
    )
    start_place_id = serializers.IntegerField(
        required=False, default=None, allow_null=True
    )
    end_place_id = serializers.IntegerField(
        required=False, default=None, allow_null=True
    )


class RouteSegmentSerializer(GeoFeatureModelSerializer):
    """Serialize a segment in a generated route as a GeoJSON Feature."""

    sequence_index = serializers.IntegerField(read_only=True)

    class Meta:
        """Meta options for RouteSegmentSerializer."""

        model = Segment
        geo_field = "geometry"
        fields = (
            "id",
            "name",
            "category",
            "surface",
            "accessible",
            "is_lit",
            "created_at",
            "sequence_index",
        )


class RouteCreateSerializer(serializers.Serializer):
    """Validate a saved route creation request."""

    name = serializers.CharField(max_length=255)
    segment_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
    )
    total_distance = serializers.FloatField(min_value=0)
    is_loop = serializers.BooleanField(default=False)
    start_point = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        required=False,
        default=None,
        allow_null=True,
    )
    end_point = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        required=False,
        default=None,
        allow_null=True,
    )


class RouteListItemSerializer(serializers.Serializer):
    """Serialize a saved route for list responses."""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    total_distance = serializers.FloatField(read_only=True)
    is_loop = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
