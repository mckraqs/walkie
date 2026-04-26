"""Serializers for the walks app."""

import json

from rest_framework import serializers

from walks.models import Walk


class WalkCreateSerializer(serializers.Serializer):
    """Validate a walk creation request."""

    name = serializers.CharField(max_length=255)
    walked_at = serializers.DateField()
    route_id = serializers.IntegerField(required=False, default=None, allow_null=True)
    geometry = serializers.JSONField(required=False, default=None)

    def validate_geometry(self, value: dict | None) -> dict | None:
        """Ensure the geometry is a valid LineString with at least 2 coordinates."""
        if value is None:
            return value
        if not isinstance(value, dict) or value.get("type") != "LineString":
            raise serializers.ValidationError("Must be a GeoJSON LineString.")
        coords = value.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2:
            raise serializers.ValidationError(
                "LineString must have at least 2 coordinates."
            )
        return value

    def validate(self, attrs: dict) -> dict:
        """Ensure exactly one of route_id or geometry is provided."""
        has_route = attrs.get("route_id") is not None
        has_geometry = attrs.get("geometry") is not None
        if has_route and has_geometry:
            raise serializers.ValidationError(
                "Provide either route_id or geometry, not both."
            )
        if not has_route and not has_geometry:
            raise serializers.ValidationError("Provide either route_id or geometry.")
        return attrs


class WalkListItemSerializer(serializers.ModelSerializer):
    """Serialize a walk for list responses."""

    class Meta:
        """Meta options for WalkListItemSerializer."""

        model = Walk
        fields = ("id", "name", "walked_at", "distance", "created_at")
        read_only_fields = fields


class WalkDetailSerializer(serializers.ModelSerializer):
    """Serialize a walk with full geometry."""

    geometry = serializers.SerializerMethodField()

    class Meta:
        """Meta options for WalkDetailSerializer."""

        model = Walk
        fields = ("id", "name", "walked_at", "distance", "geometry", "created_at")
        read_only_fields = ("id", "name", "walked_at", "distance", "created_at")

    def get_geometry(self, obj: Walk) -> dict:
        """Return geometry as GeoJSON dict."""
        return json.loads(obj.geometry.geojson)


class WalkUpdateSerializer(serializers.Serializer):
    """Validate a walk update request (name and/or date)."""

    name = serializers.CharField(max_length=255)
    walked_at = serializers.DateField(required=False)
