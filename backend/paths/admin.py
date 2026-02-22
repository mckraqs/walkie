"""Admin configuration for the paths app."""

from django.contrib.gis import admin

from paths.models import Path


@admin.register(Path)
class PathAdmin(admin.GISModelAdmin):
    """Admin interface for Path with map widget support."""

    list_display = (
        "name",
        "category",
        "surface",
        "accessible",
        "is_lit",
        "region",
        "created_at",
    )
    list_filter = ("category", "accessible", "is_lit", "region")
    search_fields = ("name",)
    readonly_fields = ("created_at",)
    raw_id_fields = ("region",)
