"""Serializers for the paths app."""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from paths.models import Path, Segment


class PathSerializer(GeoFeatureModelSerializer):
    """Serialize a Path as a GeoJSON Feature."""

    class Meta:
        """Meta options for PathSerializer."""

        model = Path
        geo_field = "geometry"
        fields = (
            "id",
            "name",
            "category",
            "surface",
            "accessible",
            "is_lit",
            "created_at",
        )


class SegmentSerializer(GeoFeatureModelSerializer):
    """Serialize a Segment as a GeoJSON Feature.

    The ``length`` field is not stored on the model; it must be provided
    as an annotation on the queryset passed to this serializer.
    """

    length = serializers.SerializerMethodField()

    def get_length(self, obj: Segment) -> float:
        """Return annotated length in metres as a plain float."""
        val = getattr(obj, "length", None)
        if val is None:
            return 0.0
        # Length() annotation returns a Distance object; extract metres.
        return float(val.m) if hasattr(val, "m") else float(val)

    class Meta:
        """Meta options for SegmentSerializer."""

        model = Segment
        geo_field = "geometry"
        fields = (
            "id",
            "name",
            "category",
            "surface",
            "accessible",
            "is_lit",
            "source",
            "target",
            "length",
            "created_at",
        )
