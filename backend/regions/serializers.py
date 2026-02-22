"""Serializers for the regions app."""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from regions.models import Region


class RegionListItemSerializer(serializers.ModelSerializer):
    """Serialize a Region as flat JSON without geometry."""

    class Meta:
        """Meta options for RegionListItemSerializer."""

        model = Region
        fields = (
            "id",
            "code",
            "name",
            "administrative_district_lvl_1",
            "administrative_district_lvl_2",
        )


class RegionSerializer(GeoFeatureModelSerializer):
    """Serialize a Region as a GeoJSON Feature."""

    class Meta:
        """Meta options for RegionSerializer."""

        model = Region
        geo_field = "boundary"
        fields = (
            "id",
            "code",
            "name",
            "administrative_district_lvl_1",
            "administrative_district_lvl_2",
            "description",
            "created_at",
            "updated_at",
        )
