"""Models for the walks app."""

from typing import ClassVar

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.contrib.postgres.fields import ArrayField
from django.db import models

from regions.models import Region


class Walk(models.Model):
    """A recorded walk within a region."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="walks",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name="walks",
    )
    name = models.CharField(max_length=255)
    geometry = gis_models.LineStringField(srid=4326)
    segment_ids = ArrayField(models.IntegerField(), default=list)
    walked_at = models.DateField()
    distance = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """Meta options for Walk."""

        db_table = "walks"
        ordering: ClassVar = ["-walked_at", "-created_at"]
        indexes: ClassVar = [
            models.Index(fields=["user", "region"]),
            models.Index(fields=["walked_at"]),
        ]

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return f"{self.name} ({self.walked_at})"
