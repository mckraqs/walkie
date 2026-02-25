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
