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


class PathWalkAction(models.TextChoices):
    """Possible actions for a path walk log entry."""

    WALKED = "walked", "Walked"
    UNWALKED = "unwalked", "Unwalked"


class PathWalkLog(models.Model):
    """An audit log entry recording when a user walked or unwalked a path."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="path_walk_logs",
    )
    path = models.ForeignKey(
        "paths.Path",
        on_delete=models.CASCADE,
        related_name="walk_logs",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name="path_walk_logs",
    )
    action = models.CharField(max_length=10, choices=PathWalkAction.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        """Meta options for PathWalkLog."""

        db_table = "paths_walked"
        indexes: ClassVar = [
            models.Index(fields=["user", "region"]),
            models.Index(fields=["user", "path"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return f"{self.user} {self.action} {self.path} in {self.region}"
