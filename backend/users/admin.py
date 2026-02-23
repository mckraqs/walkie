"""Admin configuration for the users app."""

from django.contrib import admin

from users.models import FavoriteRegion


@admin.register(FavoriteRegion)
class FavoriteRegionAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Admin for FavoriteRegion model."""

    list_display = ("user", "region", "created_at")
    list_filter = ("user",)
    raw_id_fields = ("user", "region")
