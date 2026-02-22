"""Admin configuration for the regions app."""

from django.contrib.gis import admin

from regions.models import Region


@admin.register(Region)
class RegionAdmin(admin.GISModelAdmin):
    """Admin interface for Region with map widget support."""

    list_display = ("name", "created_at", "updated_at")
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at")
