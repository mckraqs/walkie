"""Serializers for the paths app."""

from rest_framework_gis.serializers import GeoFeatureModelSerializer

from paths.models import Path


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
