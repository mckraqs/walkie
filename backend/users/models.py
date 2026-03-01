"""Models for the users app."""

from typing import ClassVar

from django.conf import settings
from django.db import models

from regions.models import Region


class FavoriteRegion(models.Model):
    """A user's favorited region."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favorite_regions",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name="favorited_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """Meta options for FavoriteRegion."""

        db_table = "favorite_regions"
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["user", "region"],
                name="unique_user_favorite_region",
            ),
        ]

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return f"{self.user} -> {self.region}"
