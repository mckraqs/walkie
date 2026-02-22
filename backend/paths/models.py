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
