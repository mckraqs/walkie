"""Backfill segment_ids for custom routes with empty segments."""

import json

from django.core.management.base import BaseCommand

from routes.models import Route
from routes.services import match_segments_to_geometry


class Command(BaseCommand):
    """Re-match segments for custom routes with empty segment_ids."""

    help = "Re-match segments for custom routes with empty segment_ids."

    def handle(self, *args: object, **options: object) -> None:
        """Run the backfill."""
        routes = Route.objects.filter(
            is_custom=True,
            custom_geometry__isnull=False,
            segment_ids=[],
        )

        self.stdout.write(f"Found {routes.count()} custom routes to backfill.")

        for route in routes:
            geojson = json.dumps(json.loads(route.custom_geometry.geojson))
            result = match_segments_to_geometry(route.region_id, geojson)

            route.segment_ids = result.segment_ids
            route.total_distance = result.total_distance
            route.save(update_fields=["segment_ids", "total_distance"])

            self.stdout.write(
                f"  Route {route.id} ({route.name}): "
                f"matched {len(result.segment_ids)} segments, "
                f"{result.total_distance:.0f}m"
            )

        self.stdout.write(self.style.SUCCESS("Done."))
