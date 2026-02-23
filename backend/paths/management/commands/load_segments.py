"""Management command to create noded segments from existing paths."""

import logging
from typing import Any

import shapely
from django.contrib.gis.geos import GEOSGeometry
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction
from shapely import STRtree
from shapely.ops import unary_union

from paths.models import Path, PathSegment, Segment
from regions.models import Region

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """Split paths at every intersection to create routable segments."""

    help = (
        "Create noded segments from existing paths. "
        "Paths are split at every intersection so that each segment "
        "connects only at its endpoints."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        """Define command arguments."""
        parser.add_argument(
            "--batch-size",
            type=int,
            default=5000,
            help="Number of records per bulk_create call (default: 5000).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the operation without writing to the database.",
        )
        parser.add_argument(
            "--tolerance",
            type=float,
            default=1e-8,
            help="Buffer tolerance for parent attribution (default: 1e-8).",
        )
        parser.add_argument(
            "--region-code",
            type=str,
            default=None,
            help="Process a single region by code.",
        )

    def handle(self, *args: Any, **options: Any) -> None:  # noqa: ANN401
        """Execute the command."""
        batch_size: int = options["batch_size"]
        dry_run: bool = options["dry_run"]
        tolerance: float = options["tolerance"]
        region_code: str | None = options["region_code"]

        groups = self._get_region_groups(region_code)

        total_segments = 0
        total_joins = 0

        for region, paths in groups:
            region_label = region.code if region else "NULL"
            self.stdout.write(f"Processing region {region_label}: {len(paths)} paths")

            segments, joins = self._process_region(
                region, paths, tolerance, batch_size, dry_run
            )
            total_segments += segments
            total_joins += joins

        action = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {total_segments} segments, {total_joins} path-segment links."
            )
        )

    def _get_region_groups(
        self, region_code: str | None
    ) -> list[tuple[Region | None, list[Path]]]:
        """Group paths by region for processing.

        Args:
            region_code: Optional code to filter a single region.

        Returns:
            List of (region_or_none, paths) tuples.
        """
        groups: list[tuple[Region | None, list[Path]]] = []

        if region_code:
            region = Region.objects.get(code=region_code)
            paths = list(Path.objects.filter(region=region))
            if paths:
                groups.append((region, paths))
        else:
            for region in Region.objects.all():
                paths = list(Path.objects.filter(region=region))
                if paths:
                    groups.append((region, paths))

            null_paths = list(Path.objects.filter(region__isnull=True))
            if null_paths:
                groups.append((None, null_paths))

        return groups

    def _process_region(
        self,
        region: Region | None,
        paths: list[Path],
        tolerance: float,
        batch_size: int,
        dry_run: bool,
    ) -> tuple[int, int]:
        """Node paths in a region and create segments.

        Args:
            region: Region instance or None for unassigned paths.
            paths: Path objects to process.
            tolerance: Buffer tolerance for parent attribution.
            batch_size: Records per bulk_create call.
            dry_run: If True, do not write to the database.

        Returns:
            Tuple of (segment_count, join_count).
        """
        shapely_lines, path_lookup = self._extract_lines(paths)

        if not shapely_lines:
            return 0, 0

        noded = unary_union(shapely_lines)
        noded_segments = self._explode_to_linestrings(noded)

        if not noded_segments:
            return 0, 0

        tree = STRtree(shapely_lines)

        segment_objects: list[Segment] = []
        join_pairs: list[tuple[int, int]] = []  # (segment_idx, path_idx)

        for seg_geom in noded_segments:
            parent_idx = self._find_parent(seg_geom, tree, shapely_lines, tolerance)
            parent_path = path_lookup[parent_idx]

            segment_objects.append(
                Segment(
                    region=region,
                    geometry=GEOSGeometry(seg_geom.wkt, srid=4326),
                    name=parent_path.name,
                    category=parent_path.category,
                    surface=parent_path.surface,
                    accessible=parent_path.accessible,
                    is_lit=parent_path.is_lit,
                )
            )

            parent_indices = self._find_all_parents(
                seg_geom, tree, shapely_lines, tolerance
            )
            seen_path_ids: set[int | None] = set()
            for pidx in parent_indices:
                pid = path_lookup[pidx].pk
                if pid not in seen_path_ids:
                    seen_path_ids.add(pid)
                    join_pairs.append((len(segment_objects) - 1, pidx))

        if dry_run:
            return len(segment_objects), len(join_pairs)

        return self._bulk_save(segment_objects, join_pairs, path_lookup, batch_size)

    def _extract_lines(
        self, paths: list[Path]
    ) -> tuple[list[shapely.LineString], list[Path]]:
        """Convert path geometries to Shapely LineStrings.

        MultiLineStrings are exploded into individual LineStrings.

        Args:
            paths: Path objects to convert.

        Returns:
            Tuple of (shapely_lines, path_lookup) where path_lookup[i] is
            the parent Path for shapely_lines[i].
        """
        shapely_lines: list[shapely.LineString] = []
        path_lookup: list[Path] = []

        skipped = 0
        for path in paths:
            try:
                geom = shapely.from_wkt(path.geometry.wkt)
            except Exception:
                logger.warning("Failed to parse WKT for path %d, skipping.", path.pk)
                skipped += 1
                continue

            if isinstance(geom, shapely.MultiLineString):
                for line in geom.geoms:
                    shapely_lines.append(line)
                    path_lookup.append(path)
            elif isinstance(geom, shapely.LineString):
                shapely_lines.append(geom)
                path_lookup.append(path)
            else:
                logger.warning(
                    "Path %d has unsupported geometry type: %s, skipping.",
                    path.pk,
                    geom.geom_type,
                )
                skipped += 1

        if skipped:
            logger.info(
                "Skipped %d paths with invalid/unsupported geometries.",
                skipped,
            )

        return shapely_lines, path_lookup

    def _explode_to_linestrings(
        self, geom: shapely.Geometry
    ) -> list[shapely.LineString]:
        """Explode a geometry into individual LineStrings.

        Args:
            geom: A geometry (possibly a GeometryCollection or MultiLineString).

        Returns:
            List of LineString geometries.
        """
        if isinstance(geom, shapely.LineString):
            return [geom]
        if hasattr(geom, "geoms"):
            result: list[shapely.LineString] = []
            for g in geom.geoms:
                if isinstance(g, shapely.LineString):
                    result.append(g)
            return result
        return []

    def _find_parent(
        self,
        segment: shapely.LineString,
        tree: STRtree,
        lines: list[shapely.LineString],
        tolerance: float,
    ) -> int:
        """Find the first parent line that contains a segment.

        Args:
            segment: The noded segment to attribute.
            tree: Spatial index over the original lines.
            lines: Original Shapely LineString list.
            tolerance: Buffer tolerance for containment check.

        Returns:
            Index into lines of the parent line.
        """
        candidates = tree.query(segment)
        for idx in candidates:
            if lines[idx].buffer(tolerance).contains(segment):
                return int(idx)

        nearest_idx = tree.nearest(segment)
        logger.warning(
            "No parent found within tolerance for segment (%.6f..); "
            "falling back to nearest line (idx=%d). "
            "Consider increasing --tolerance.",
            segment.coords[0][0],
            nearest_idx,
        )
        return int(nearest_idx)

    def _find_all_parents(
        self,
        segment: shapely.LineString,
        tree: STRtree,
        lines: list[shapely.LineString],
        tolerance: float,
    ) -> list[int]:
        """Find all parent lines that contain a segment.

        Args:
            segment: The noded segment to attribute.
            tree: Spatial index over the original lines.
            lines: Original Shapely LineString list.
            tolerance: Buffer tolerance for containment check.

        Returns:
            List of indices into lines of matching parents.
        """
        candidates = tree.query(segment)
        parents: list[int] = []
        for idx in candidates:
            if lines[idx].buffer(tolerance).contains(segment):
                parents.append(int(idx))

        if not parents:
            nearest_idx = tree.nearest(segment)
            logger.warning(
                "No parents found within tolerance for segment (%.6f..); "
                "falling back to nearest line (idx=%d).",
                segment.coords[0][0],
                nearest_idx,
            )
            parents.append(int(nearest_idx))

        return parents

    def _bulk_save(
        self,
        segment_objects: list[Segment],
        join_pairs: list[tuple[int, int]],
        path_lookup: list[Path],
        batch_size: int,
    ) -> tuple[int, int]:
        """Save segments and join records to the database.

        Args:
            segment_objects: Segment instances to create.
            join_pairs: List of (segment_idx, path_lookup_idx) tuples.
            path_lookup: Maps line index to parent Path.
            batch_size: Records per bulk_create call.

        Returns:
            Tuple of (segment_count, join_count).
        """
        with transaction.atomic():
            for i in range(0, len(segment_objects), batch_size):
                batch = segment_objects[i : i + batch_size]
                Segment.objects.bulk_create(batch, batch_size=batch_size)
                logger.info(
                    "Inserted segment batch %d-%d of %d",
                    i,
                    min(i + batch_size, len(segment_objects)),
                    len(segment_objects),
                )

            join_objects: list[PathSegment] = []
            for seg_idx, path_idx in join_pairs:
                join_objects.append(
                    PathSegment(
                        path=path_lookup[path_idx],
                        segment=segment_objects[seg_idx],
                    )
                )

            for i in range(0, len(join_objects), batch_size):
                batch = join_objects[i : i + batch_size]
                PathSegment.objects.bulk_create(batch, batch_size=batch_size)

        return len(segment_objects), len(join_objects)
