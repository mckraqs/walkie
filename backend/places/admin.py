"""Admin configuration for the places app."""

from django.contrib.gis import admin

from places.models import Place


@admin.register(Place)
class PlaceAdmin(admin.GISModelAdmin):
    """Admin for Place model."""

    list_display = ("name", "user", "region", "created_at")
    list_filter = ("region",)
    raw_id_fields = ("user", "region")
