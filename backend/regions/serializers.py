"""Serializers for the regions app."""

from rest_framework_gis.serializers import GeoFeatureModelSerializer

from regions.models import Region


class RegionSerializer(GeoFeatureModelSerializer):
    """Serialize a Region as a GeoJSON Feature."""

    class Meta:
        """Meta options for RegionSerializer."""

        model = Region
        geo_field = "boundary"
        fields = ("id", "code", "name", "description", "created_at", "updated_at")
