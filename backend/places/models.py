"""Models for the places app."""

from typing import ClassVar

from django.conf import settings
from django.contrib.gis.db import models

from regions.models import Region


class Place(models.Model):
    """A user-defined named location within a region."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="places",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name="places",
    )
    name = models.CharField(max_length=255)
    location = models.PointField(srid=4326)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Place."""

        db_table = "places"
        indexes: ClassVar = [
            models.Index(fields=["user", "region"]),
        ]
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["user", "region", "name"],
                name="unique_user_region_place_name",
            ),
        ]

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return f"{self.name} ({self.user})"
