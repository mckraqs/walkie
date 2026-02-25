"""Serializers for the places app."""

from rest_framework import serializers


class PlaceSerializer(serializers.Serializer):
    """Read serializer for Place objects."""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    location = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def get_location(self, obj: object) -> list[float]:
        """Return location as [longitude, latitude]."""
        return [obj.location.x, obj.location.y]


class PlaceCreateSerializer(serializers.Serializer):
    """Validate a place creation request."""

    name = serializers.CharField(max_length=255)
    location = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
    )


class PlaceUpdateSerializer(serializers.Serializer):
    """Validate a place update request."""

    name = serializers.CharField(max_length=255, required=False)
    location = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
        required=False,
    )
