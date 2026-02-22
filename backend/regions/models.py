"""Models for the regions app."""

from typing import ClassVar

from django.contrib.gis.db import models


class Region(models.Model):
    """A geographic region defined by a boundary polygon."""

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    boundary = models.MultiPolygonField(srid=4326)
    administrative_district_lvl_1 = models.CharField(max_length=100, blank=True)
    administrative_district_lvl_2 = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Region."""

        db_table = "regions"
        indexes: ClassVar = [
            models.Index(fields=["code"]),
        ]

    def __str__(self) -> str:
        """Return the region name and code."""
        return f"{self.name} ({self.code})"
