"""Management command to load regions from a CSV file into the database."""

import csv
import logging
from pathlib import Path as FilePath
from typing import Any

from django.contrib.gis.geos import GEOSGeometry, MultiPolygon, Polygon
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from regions.models import Region

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"region_code", "name", "boundary_wkt"}


class Command(BaseCommand):
    """Load regions from a CSV file with boundary WKT into the Region model."""

    help = "Import regions from a CSV file into the database."

    def add_arguments(self, parser: CommandParser) -> None:
        """Define command arguments."""
        parser.add_argument(
            "csv_path",
            type=str,
            help="Path to the regions CSV file.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Number of records per bulk_create call (default: 500).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the load without writing to the database.",
        )

    def handle(self, *args: Any, **options: Any) -> None:  # noqa: ANN401
        """Execute the command."""
        csv_path = FilePath(options["csv_path"])
        batch_size: int = options["batch_size"]
        dry_run: bool = options["dry_run"]

        self._validate_file(csv_path)
        rows = self._read_csv(csv_path)
        region_objects, skipped = self._build_region_objects(rows)

        if dry_run:
            self.stdout.write(
                f"[DRY RUN] Would load {len(region_objects)} regions "
                f"(skipped {skipped} invalid rows)."
            )
            return

        self._bulk_insert(region_objects, batch_size)
        self.stdout.write(
            self.style.SUCCESS(
                f"Loaded {len(region_objects)} regions (skipped {skipped})."
            )
        )

    def _validate_file(self, csv_path: FilePath) -> None:
        """Ensure the file exists and has a .csv extension."""
        if not csv_path.exists():
            msg = f"File not found: {csv_path}"
            raise FileNotFoundError(msg)
        if csv_path.suffix.lower() != ".csv":
            msg = f"Expected a .csv file, got: {csv_path.suffix}"
            raise ValueError(msg)

    def _read_csv(self, csv_path: FilePath) -> list[dict[str, str]]:
        """Read the CSV and validate columns."""
        with csv_path.open() as f:
            reader = csv.DictReader(f)
            if reader.fieldnames is None:
                msg = f"CSV file is empty: {csv_path}"
                raise ValueError(msg)

            missing = REQUIRED_COLUMNS - set(reader.fieldnames)
            if missing:
                msg = f"Missing required columns: {missing}"
                raise ValueError(msg)

            rows = list(reader)

        if not rows:
            msg = f"CSV file has no data rows: {csv_path}"
            raise ValueError(msg)

        self.stdout.write(f"Read {len(rows)} rows from {csv_path}")
        return rows

    def _parse_boundary(self, wkt: str) -> MultiPolygon:
        """Parse WKT string into a MultiPolygon, buffering non-polygon hulls."""
        geom = GEOSGeometry(wkt, srid=4326)
        if not isinstance(geom, Polygon | MultiPolygon):
            # Collinear streets produce LineString/Point convex hulls;
            # buffer slightly to create a valid polygon.
            buffered = geom.buffer(0.0001)
            return MultiPolygon(buffered)
        if isinstance(geom, Polygon):
            return MultiPolygon(geom)
        return geom

    def _build_region_objects(
        self,
        rows: list[dict[str, str]],
    ) -> tuple[list[Region], int]:
        """Convert CSV rows to Region model instances.

        Returns:
            A tuple of (region_objects, skipped_count).
        """
        region_objects: list[Region] = []
        skipped = 0

        for row in rows:
            try:
                boundary = self._parse_boundary(row["boundary_wkt"])
            except Exception:
                logger.warning(
                    "Skipping region %s: invalid boundary WKT",
                    row.get("region_code", "?"),
                )
                skipped += 1
                continue

            region_objects.append(
                Region(
                    code=row["region_code"],
                    name=row["name"],
                    boundary=boundary,
                )
            )

        return region_objects, skipped

    def _bulk_insert(self, region_objects: list[Region], batch_size: int) -> None:
        """Insert all Region objects in batches inside a single transaction."""
        with transaction.atomic():
            for i in range(0, len(region_objects), batch_size):
                batch = region_objects[i : i + batch_size]
                Region.objects.bulk_create(batch, batch_size=batch_size)
                logger.info(
                    "Inserted batch %d-%d of %d",
                    i,
                    min(i + batch_size, len(region_objects)),
                    len(region_objects),
                )
