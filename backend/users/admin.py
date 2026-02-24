"""Admin configuration for the users app."""

from django.contrib import admin

from users.models import FavoriteRegion, PathWalkLog


@admin.register(FavoriteRegion)
class FavoriteRegionAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Admin for FavoriteRegion model."""

    list_display = ("user", "region", "created_at")
    list_filter = ("user",)
    raw_id_fields = ("user", "region")


@admin.register(PathWalkLog)
class PathWalkLogAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Read-only admin for PathWalkLog audit log."""

    list_display = ("user", "path", "region", "action", "created_at")
    list_filter = ("action", "region")
    raw_id_fields = ("user", "path", "region")

    def get_readonly_fields(
        self,
        request: object,
        obj: object = None,
    ) -> tuple[str, ...]:
        """Return all fields as read-only."""
        return ("user", "path", "region", "action", "created_at")
