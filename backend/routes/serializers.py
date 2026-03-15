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
    start_coords = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        required=False,
        default=None,
        allow_null=True,
    )
    end_coords = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        required=False,
        default=None,
        allow_null=True,
    )

    def validate(self, attrs: dict) -> dict:
        """Ensure place ID and raw coords are mutually exclusive."""
        if attrs.get("start_place_id") and attrs.get("start_coords"):
            raise serializers.ValidationError(
                "Provide either start_place_id or start_coords, not both."
            )
        if attrs.get("end_place_id") and attrs.get("end_coords"):
            raise serializers.ValidationError(
                "Provide either end_place_id or end_coords, not both."
            )
        return attrs


class RouteSegmentSerializer(GeoFeatureModelSerializer):
    """Serialize a segment in a generated route as a GeoJSON Feature."""

    sequence_index = serializers.IntegerField(read_only=True)
    path_id = serializers.IntegerField(read_only=True)

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
            "path_id",
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
    is_custom = serializers.BooleanField(default=False)
    walked = serializers.BooleanField(default=False)
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
    is_custom = serializers.BooleanField(read_only=True)
    walked = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class RouteRenameSerializer(serializers.Serializer):
    """Validate a route rename request."""

    name = serializers.CharField(max_length=255)
