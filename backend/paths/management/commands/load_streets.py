"""Management command to load streets from a cleaned GeoPackage into the database."""

import logging
from pathlib import Path as FilePath
from typing import Any

import geopandas as gpd
from django.contrib.gis.geos import GEOSGeometry
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from paths.models import Path
from regions.models import Region

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {
    "name",
    "geometry",
    "category",
    "surface",
    "accessible",
    "is_lit",
    "region_code",
}


class Command(BaseCommand):
    """Load street geometries from a cleaned GeoPackage into the Path model."""

    help = "Import streets from a cleaned GeoPackage file into the database."

    def add_arguments(self, parser: CommandParser) -> None:
        """Define command arguments."""
        parser.add_argument(
            "gpkg_path",
            type=str,
            help="Path to the cleaned GeoPackage file.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=5000,
            help="Number of records per bulk_create call (default: 5000).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the load without writing to the database.",
        )

    def handle(self, *args: Any, **options: Any) -> None:  # noqa: ANN401
        """Execute the command."""
        gpkg_path = FilePath(options["gpkg_path"])
        batch_size: int = options["batch_size"]
        dry_run: bool = options["dry_run"]

        self._validate_file(gpkg_path)
        gdf = self._read_gpkg(gpkg_path)
        self._validate_columns(gdf)
        gdf = self._ensure_epsg4326(gdf)

        region_lookup = {r.code: r for r in Region.objects.all()}
        self.stdout.write(f"Loaded {len(region_lookup)} regions for FK lookup")

        path_objects, skipped = self._build_path_objects(gdf, region_lookup)

        if dry_run:
            self.stdout.write(
                f"[DRY RUN] Would load {len(path_objects)} paths "
                f"(skipped {skipped} invalid geometries)."
            )
            return

        self._bulk_insert(path_objects, batch_size)

        self.stdout.write(
            self.style.SUCCESS(f"Loaded {len(path_objects)} paths (skipped {skipped}).")
        )

    def _validate_file(self, gpkg_path: FilePath) -> None:
        """Ensure the file exists and has a .gpkg extension."""
        if not gpkg_path.exists():
            msg = f"File not found: {gpkg_path}"
            raise FileNotFoundError(msg)
        if gpkg_path.suffix.lower() != ".gpkg":
            msg = f"Expected a .gpkg file, got: {gpkg_path.suffix}"
            raise ValueError(msg)

    def _read_gpkg(self, gpkg_path: FilePath) -> gpd.GeoDataFrame:
        """Read the GeoPackage and fail if empty."""
        gdf = gpd.read_file(gpkg_path)
        if gdf.empty:
            msg = f"GeoPackage is empty: {gpkg_path}"
            raise ValueError(msg)
        self.stdout.write(f"Read {len(gdf)} rows from {gpkg_path}")
        return gdf

    def _validate_columns(self, gdf: gpd.GeoDataFrame) -> None:
        """Ensure all required columns are present."""
        missing = REQUIRED_COLUMNS - set(gdf.columns)
        if missing:
            msg = f"Missing required columns: {missing}"
            raise ValueError(msg)

    def _ensure_epsg4326(self, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        """Reproject to EPSG:4326 if needed."""
        if gdf.crs is not None and not gdf.crs.equals("EPSG:4326"):
            self.stdout.write(f"Reprojecting from {gdf.crs} to EPSG:4326")
            gdf = gdf.to_crs(epsg=4326)
        return gdf

    def _build_path_objects(
        self,
        gdf: gpd.GeoDataFrame,
        region_lookup: dict[str, Region],
    ) -> tuple[list[Path], int]:
        """Convert GeoDataFrame rows to Path model instances.

        Returns:
            A tuple of (path_objects, skipped_count).
        """
        path_objects: list[Path] = []
        skipped = 0

        for row in gdf.itertuples(index=False):
            try:
                geom = GEOSGeometry(row.geometry.wkt, srid=4326)  # type: ignore
            except Exception:
                logger.warning("Skipping row with invalid geometry: %s", row.name)
                skipped += 1
                continue

            code = row.region_code if row.region_code else ""
            region = region_lookup.get(code) if code else None  # type: ignore

            path_objects.append(
                Path(
                    region=region,
                    name=row.name if row.name else "",
                    geometry=geom,
                    category=row.category,
                    surface=row.surface if row.surface else "",
                    accessible=bool(row.accessible),
                    is_lit=bool(row.is_lit),
                )
            )

        return path_objects, skipped

    def _bulk_insert(self, path_objects: list[Path], batch_size: int) -> None:
        """Insert all Path objects in batches inside a single transaction."""
        with transaction.atomic():
            for i in range(0, len(path_objects), batch_size):
                batch = path_objects[i : i + batch_size]
                Path.objects.bulk_create(batch, batch_size=batch_size)
                logger.info(
                    "Inserted batch %d-%d of %d",
                    i,
                    min(i + batch_size, len(path_objects)),
                    len(path_objects),
                )
