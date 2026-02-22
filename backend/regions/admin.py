"""Admin configuration for the regions app."""

from django.contrib.gis import admin

from regions.models import Region


@admin.register(Region)
class RegionAdmin(admin.GISModelAdmin):
    """Admin interface for Region with map widget support."""

    list_display = (
        "name",
        "code",
        "administrative_district_lvl_1",
        "administrative_district_lvl_2",
        "created_at",
        "updated_at",
    )
    search_fields = (
        "name",
        "code",
        "administrative_district_lvl_1",
        "administrative_district_lvl_2",
    )
    list_filter = ("administrative_district_lvl_1",)
    readonly_fields = ("created_at", "updated_at")
