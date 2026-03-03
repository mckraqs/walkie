"""Management command to build pgRouting topology for the segments network."""

import logging
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import connection, transaction

from paths.models import Segment

logger = logging.getLogger(__name__)

DEFAULT_TOLERANCE = 0.0001  # ~10m at Poland's latitude


class Command(BaseCommand):
    """Build pgRouting topology by running pgr_createTopology on the segments table."""

    help = "Build pgRouting network topology for route generation."

    def add_arguments(self, parser: CommandParser) -> None:
        """Define command arguments."""
        parser.add_argument(
            "--tolerance",
            type=float,
            default=DEFAULT_TOLERANCE,
            help=f"Snapping tolerance for node matching ({DEFAULT_TOLERANCE}).",
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Drop and rebuild the topology from scratch.",
        )

    def handle(self, *args: Any, **options: Any) -> None:  # noqa: ANN401
        """Execute the command."""
        tolerance: float = options["tolerance"]
        clean: bool = options["clean"]

        total_segments = Segment.objects.count()
        if total_segments == 0:
            self.stdout.write(self.style.WARNING("No segments found in the database."))
            logger.warning("build_topology: no segments found, skipping.")
            return

        with transaction.atomic():  # pyright: ignore[reportGeneralTypeIssues]
            if clean:
                self._clean_topology()

            self._build_topology(tolerance)

        self._report_stats(total_segments)

    def _clean_topology(self) -> None:
        """Reset source/target columns and drop the vertices table.

        Warning: This clears topology data for ALL regions globally.
        Concurrent route requests during a rebuild may see inconsistent state.
        Callers should wrap this in a transaction.
        """
        logger.info("Cleaning existing topology.")
        self.stdout.write("Cleaning existing topology...")
        with connection.cursor() as cursor:
            cursor.execute("UPDATE segments SET source = NULL, target = NULL")
            cursor.execute("DROP TABLE IF EXISTS segments_vertices_pgr CASCADE")
        self.stdout.write("Topology cleaned.")

    def _build_topology(self, tolerance: float) -> None:
        """Run pgr_createTopology to populate source/target and create vertices."""
        logger.info("Building topology with tolerance %s.", tolerance)
        self.stdout.write(f"Building topology with tolerance {tolerance}...")
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pgr_createTopology("
                "  'segments', %s, 'geometry', 'id',"
                "  'source', 'target', clean := true"
                ")",
                [tolerance],
            )
            result = cursor.fetchone()
            self.stdout.write(f"pgr_createTopology result: {result}")

    def _report_stats(self, total_segments: int) -> None:
        """Report topology build statistics."""
        routable = Segment.objects.filter(
            source__isnull=False, target__isnull=False
        ).count()

        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM segments_vertices_pgr")
            node_count = cursor.fetchone()[0]  # type: ignore[index]

        msg = (
            f"Topology built: {routable}/{total_segments} routable segments, "
            f"{node_count} nodes."
        )
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
