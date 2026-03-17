"""Models for the routes app."""

from typing import ClassVar

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.contrib.postgres.fields import ArrayField
from django.db import models

from regions.models import Region


class Route(models.Model):
    """A user-saved walking route within a region."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_routes",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name="saved_routes",
    )
    name = models.CharField(max_length=255)
    segment_ids = ArrayField(models.IntegerField())
    total_distance = models.FloatField()
    is_loop = models.BooleanField(default=False)
    is_custom = models.BooleanField(default=False)
    walked = models.BooleanField(default=False)
    custom_geometry = gis_models.LineStringField(srid=4326, null=True, blank=True)
    start_point = ArrayField(models.FloatField(), size=2, null=True, blank=True)
    end_point = ArrayField(models.FloatField(), size=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """Meta options for Route."""

        db_table = "routes"
        ordering: ClassVar = ["-created_at"]
        indexes: ClassVar = [
            models.Index(fields=["user", "region"]),
        ]

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return f"{self.name} ({self.user})"
