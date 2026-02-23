"""Serializers for the regions app."""

from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer

from regions.models import Region


class RegionListItemSerializer(serializers.ModelSerializer):
    """Serialize a Region as flat JSON without geometry."""

    is_favorite = serializers.SerializerMethodField()

    class Meta:
        """Meta options for RegionListItemSerializer."""

        model = Region
        fields = (
            "id",
            "code",
            "name",
            "administrative_district_lvl_1",
            "administrative_district_lvl_2",
            "is_favorite",
        )

    def get_is_favorite(self, obj: Region) -> bool:
        """Return whether the region is favorited by the current user.

        Args:
            obj: The Region instance being serialized.

        Returns:
            True if annotated as favorite, False otherwise.
        """
        return bool(getattr(obj, "_is_favorite", False))


class RegionSerializer(GeoFeatureModelSerializer):
    """Serialize a Region as a GeoJSON Feature."""

    is_favorite = serializers.SerializerMethodField()

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
            "is_favorite",
        )

    def get_is_favorite(self, obj: Region) -> bool:
        """Return whether the region is favorited by the current user.

        Args:
            obj: The Region instance being serialized.

        Returns:
            True if annotated as favorite, False otherwise.
        """
        return bool(getattr(obj, "_is_favorite", False))
