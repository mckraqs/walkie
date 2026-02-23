"""Models for the paths app."""

from typing import ClassVar

from django.contrib.gis.db import models

from regions.models import Region


class Path(models.Model):
    """A street or path segment with geometry and metadata."""

    region = models.ForeignKey(
        Region,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="paths",
    )
    name = models.CharField(max_length=255, blank=True)
    geometry = models.MultiLineStringField(srid=4326)
    category = models.CharField(max_length=50)
    surface = models.CharField(max_length=50, blank=True)
    accessible = models.BooleanField(default=False)
    is_lit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """Meta options for Path."""

        db_table = "paths"
        indexes: ClassVar = [
            models.Index(fields=["region"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self) -> str:
        """Return the path name or a fallback with PK and category."""
        if self.name:
            return self.name
        return f"Path {self.pk} ({self.category})"


class Segment(models.Model):
    """A noded segment -- a path split at every intersection point.

    Topology (source/target) operates on segments so that every real
    intersection becomes a routable node.
    """

    region = models.ForeignKey(
        Region,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="segments",
    )
    geometry = models.LineStringField(srid=4326)
    source = models.IntegerField(null=True, blank=True, db_index=True)
    target = models.IntegerField(null=True, blank=True, db_index=True)
    name = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=50)
    surface = models.CharField(max_length=50, blank=True)
    accessible = models.BooleanField(default=False)
    is_lit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """Meta options for Segment."""

        db_table = "segments"
        indexes: ClassVar = [
            models.Index(fields=["region"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self) -> str:
        """Return the segment name or a fallback with PK and category."""
        if self.name:
            return self.name
        return f"Segment {self.pk} ({self.category})"


class PathSegment(models.Model):
    """Join table linking paths to their noded segments."""

    path = models.ForeignKey(
        Path,
        on_delete=models.CASCADE,
        related_name="path_segments",
    )
    segment = models.ForeignKey(
        Segment,
        on_delete=models.CASCADE,
        related_name="path_segments",
    )

    class Meta:
        """Meta options for PathSegment."""

        db_table = "path_segments"
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["path", "segment"],
                name="unique_path_segment",
            ),
        ]

    def __str__(self) -> str:
        """Return a string representation of the path-segment link."""
        return f"PathSegment(path={self.path_id}, segment={self.segment_id})"
