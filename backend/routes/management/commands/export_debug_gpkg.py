"""Export drawn routes and region segments to .gpkg for QGIS debugging."""

import json
from pathlib import Path

import geopandas as gpd
from django.core.management.base import BaseCommand
from django.db import connection
from shapely.geometry import shape


class Command(BaseCommand):
    """Export debug geometries (drawn routes + Radom segments) as GeoPackage files."""

    help = (
        "Export drawn route geometries and Radom segments"
        " to .gpkg files for QGIS inspection."
    )

    def add_arguments(self, parser: object) -> None:
        """Add command arguments."""
        parser.add_argument(
            "--output-dir",
            default=".",
            help="Directory to write .gpkg files to (default: current directory).",
        )
        parser.add_argument(
            "--region",
            default="Radom",
            help="Region name to export segments for (default: Radom).",
        )

    def handle(self, **options: object) -> None:
        """Run the export."""
        output_dir = Path(options["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)
        region_name = options["region"]

        self._export_drawn_routes(output_dir)
        self._export_region_segments(output_dir, region_name)

    def _export_drawn_routes(self, output_dir: Path) -> None:
        """Export all routes with custom_geometry: line + 15m buffer."""
        sql = """
            SELECT
                id,
                name,
                ST_AsGeoJSON(custom_geometry) AS line_geojson,
                ST_AsGeoJSON(
                    ST_Transform(
                        ST_Buffer(ST_Transform(custom_geometry, 2180), 15),
                        4326
                    )
                ) AS buffer_geojson
            FROM routes
            WHERE custom_geometry IS NOT NULL
        """
        with connection.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

        if not rows:
            self.stdout.write(self.style.WARNING("No drawn routes found."))
            return

        lines = []
        buffers = []
        for route_id, name, line_geojson, buffer_geojson in rows:
            line_geom = shape(json.loads(line_geojson))
            buffer_geom = shape(json.loads(buffer_geojson))
            lines.append({"route_id": route_id, "name": name, "geometry": line_geom})
            buffers.append(
                {"route_id": route_id, "name": name, "geometry": buffer_geom}
            )

        out_path = output_dir / "drawn_routes.gpkg"

        gdf_lines = gpd.GeoDataFrame(lines, crs="EPSG:4326")
        gdf_lines.to_file(out_path, layer="route_line", driver="GPKG")

        gdf_buffers = gpd.GeoDataFrame(buffers, crs="EPSG:4326")
        gdf_buffers.to_file(out_path, layer="route_buffer", driver="GPKG", mode="a")

        self.stdout.write(
            self.style.SUCCESS(f"Exported {len(rows)} drawn route(s) to {out_path}")
        )

    def _export_region_segments(self, output_dir: Path, region_name: str) -> None:
        """Export all segments for a given region."""
        sql = """
            SELECT
                s.id,
                s.name,
                s.category,
                s.surface,
                ST_AsGeoJSON(s.geometry) AS geojson
            FROM segments s
            JOIN regions r ON s.region_id = r.id
            WHERE r.name = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, [region_name])
            rows = cursor.fetchall()

        if not rows:
            self.stdout.write(
                self.style.WARNING(f"No segments found for region '{region_name}'.")
            )
            return

        features = []
        for seg_id, name, category, surface, geojson in rows:
            geom = shape(json.loads(geojson))
            features.append(
                {
                    "segment_id": seg_id,
                    "name": name,
                    "category": category,
                    "surface": surface,
                    "geometry": geom,
                }
            )

        slug = region_name.lower().replace(" ", "_")
        out_path = output_dir / f"{slug}_segments.gpkg"

        gdf = gpd.GeoDataFrame(features, crs="EPSG:4326")
        gdf.to_file(out_path, driver="GPKG")

        self.stdout.write(
            self.style.SUCCESS(
                f"Exported {len(rows)} segment(s) for '{region_name}' to {out_path}"
            )
        )
