"""Models for the regions app."""

from django.contrib.gis.db import models


class Region(models.Model):
    """A geographic region defined by a boundary polygon."""

    name = models.CharField(max_length=255, unique=True)
    boundary = models.MultiPolygonField(srid=4326)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        """Return the region name."""
        return self.name
