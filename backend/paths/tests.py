"""Tests for the paths app."""

from pathlib import Path as FilePath
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from django.contrib.gis.geos import GEOSGeometry
from django.core.management import call_command
from rest_framework.test import APIClient

from conftest import SAMPLE_LINESTRING_WKT
from paths.management.commands.load_paths import Command
from paths.models import Path, PathSegment, Segment
from regions.models import Region


@pytest.fixture
def command() -> Command:
    """Return a fresh Command instance."""
    return Command()


class TestValidateFile:
    """Tests for _validate_file."""

    def test_nonexistent_path(self, command: Command) -> None:
        """FileNotFoundError for nonexistent path."""
        with pytest.raises(FileNotFoundError, match="File not found"):
            command._validate_file(FilePath("/nonexistent/file.gpkg"))

    def test_wrong_extension(self, command: Command, tmp_path: FilePath) -> None:
        """ValueError for non-.gpkg extension."""
        bad_file = tmp_path / "data.csv"
        bad_file.touch()

        with pytest.raises(ValueError, match=r"Expected a \.gpkg file"):
            command._validate_file(bad_file)


class TestValidateColumns:
    """Tests for _validate_columns."""

    def test_missing_columns(self, command: Command) -> None:
        """ValueError when required columns are missing."""
        gdf = MagicMock()
        gdf.columns = ["name", "geometry"]

        with pytest.raises(ValueError, match="Missing required columns"):
            command._validate_columns(gdf)

    def test_all_columns_present(self, command: Command) -> None:
        """No error when all required columns are present."""
        gdf = MagicMock()
        gdf.columns = [
            "name",
            "geometry",
            "category",
            "surface",
            "accessible",
            "is_lit",
            "region_code",
        ]

        command._validate_columns(gdf)


class TestBuildPathObjects:
    """Tests for _build_path_objects."""

    def _make_row(
        self,
        *,
        name: str = "Test St",
        wkt: str = "MULTILINESTRING((20 50, 21 51))",
        category: str = "street",
        surface: str = "asphalt",
        accessible: bool = True,
        is_lit: bool = False,
        region_code: str = "001",
    ) -> SimpleNamespace:
        """Build a fake GeoDataFrame row as a SimpleNamespace with a geometry mock."""
        geom = MagicMock()
        geom.wkt = wkt
        return SimpleNamespace(
            name=name,
            geometry=geom,
            category=category,
            surface=surface,
            accessible=accessible,
            is_lit=is_lit,
            region_code=region_code,
        )

    def _make_gdf(self, rows: list[SimpleNamespace]) -> MagicMock:
        """Build a fake GeoDataFrame that yields rows from itertuples."""
        gdf = MagicMock()
        gdf.itertuples.return_value = rows
        return gdf

    def test_valid_row_with_region_lookup(self, command: Command) -> None:
        """Valid row with a matching region_code produces a Path with FK set."""
        region = Region(code="001", name="R1")
        row = self._make_row(region_code="001")
        gdf = self._make_gdf([row])

        path_objects, skipped = command._build_path_objects(gdf, {"001": region})

        assert len(path_objects) == 1
        assert skipped == 0
        assert isinstance(path_objects[0], Path)
        assert path_objects[0].region is region
        assert path_objects[0].category == "street"

    def test_empty_region_code(self, command: Command) -> None:
        """Empty region_code produces a Path with region=None."""
        row = self._make_row(region_code="")
        gdf = self._make_gdf([row])

        path_objects, _skipped = command._build_path_objects(gdf, {})

        assert len(path_objects) == 1
        assert path_objects[0].region is None

    def test_invalid_geometry_skipped(self, command: Command) -> None:
        """Invalid geometry increments skipped count."""
        row = self._make_row()
        row.geometry.wkt = "INVALID_WKT"
        gdf = self._make_gdf([row])

        path_objects, skipped = command._build_path_objects(gdf, {})

        assert len(path_objects) == 0
        assert skipped == 1


@pytest.mark.django_db
class TestRegionPathsListView:
    """Tests for the GET /api/regions/{id}/paths/ endpoint."""

    def test_returns_geojson_feature_collection(self, saved_region: Region) -> None:
        """Endpoint returns a GeoJSON FeatureCollection with correct properties."""
        Path.objects.create(
            region=saved_region,
            name="Test Street",
            geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326),
            category="street",
            surface="asphalt",
            accessible=True,
            is_lit=True,
        )
        client = APIClient()
        response = client.get(f"/api/regions/{saved_region.pk}/paths/")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 1

        feature = data["features"][0]
        assert feature["type"] == "Feature"
        assert feature["geometry"]["type"] == "MultiLineString"
        assert feature["properties"]["name"] == "Test Street"
        assert feature["properties"]["category"] == "street"
        assert feature["properties"]["surface"] == "asphalt"
        assert feature["properties"]["accessible"] is True
        assert feature["properties"]["is_lit"] is True
        assert "created_at" in feature["properties"]

    def test_empty_region_returns_empty_collection(self, saved_region: Region) -> None:
        """Endpoint returns an empty FeatureCollection for a region with no paths."""
        client = APIClient()
        response = client.get(f"/api/regions/{saved_region.pk}/paths/")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 0

    def test_paths_filtered_by_region(self, saved_region: Region) -> None:
        """Endpoint only returns paths belonging to the requested region."""
        other_region = Region.objects.create(
            code="0002_0002",
            name="Other Region",
            boundary=GEOSGeometry(
                "MULTIPOLYGON((("
                "22.0 52.0, 23.0 52.0, 23.0 53.0, "
                "22.0 53.0, 22.0 52.0)))",
                srid=4326,
            ),
        )
        geom = GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326)
        Path.objects.create(
            region=saved_region, name="In Region", geometry=geom, category="street"
        )
        Path.objects.create(
            region=other_region, name="Other Path", geometry=geom, category="street"
        )

        client = APIClient()
        response = client.get(f"/api/regions/{saved_region.pk}/paths/")

        data = response.json()
        assert len(data["features"]) == 1
        assert data["features"][0]["properties"]["name"] == "In Region"


@pytest.mark.django_db
class TestLoadSegments:
    """Tests for the load_segments management command."""

    def _create_crossing_paths(self, region: Region) -> list[Path]:
        """Create two crossing paths: one horizontal, one vertical.

        They intersect at (20.001, 50.001).
        """
        horizontal = Path.objects.create(
            region=region,
            name="Horizontal St",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.001, 20.002 50.001))",
                srid=4326,
            ),
            category="street",
            surface="asphalt",
            accessible=True,
            is_lit=True,
        )
        vertical = Path.objects.create(
            region=region,
            name="Vertical St",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.001 50.000, 20.001 50.002))",
                srid=4326,
            ),
            category="footway",
            surface="gravel",
            accessible=False,
            is_lit=False,
        )
        return [horizontal, vertical]

    def _create_parallel_paths(self, region: Region) -> list[Path]:
        """Create two parallel (non-crossing) paths."""
        p1 = Path.objects.create(
            region=region,
            name="Parallel A",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.000, 20.002 50.000))",
                srid=4326,
            ),
            category="street",
            surface="asphalt",
        )
        p2 = Path.objects.create(
            region=region,
            name="Parallel B",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.001, 20.002 50.001))",
                srid=4326,
            ),
            category="street",
            surface="asphalt",
        )
        return [p1, p2]

    def test_crossing_paths_produce_four_segments(self, saved_region: Region) -> None:
        """Two crossing paths produce 4 segments at the intersection."""
        self._create_crossing_paths(saved_region)

        call_command("load_segments", "--region-code", saved_region.code)

        assert Segment.objects.filter(region=saved_region).count() == 4

    def test_non_crossing_paths_produce_same_count(self, saved_region: Region) -> None:
        """Two parallel paths produce 2 segments (no splitting)."""
        self._create_parallel_paths(saved_region)

        call_command("load_segments", "--region-code", saved_region.code)

        assert Segment.objects.filter(region=saved_region).count() == 2

    def test_segment_inherits_parent_metadata(self, saved_region: Region) -> None:
        """Segment copies name/category/surface/accessible/is_lit from parent."""
        Path.objects.create(
            region=saved_region,
            name="Named Street",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.000, 20.001 50.000))",
                srid=4326,
            ),
            category="residential",
            surface="cobblestone",
            accessible=True,
            is_lit=True,
        )

        call_command("load_segments", "--region-code", saved_region.code)

        segment = Segment.objects.get(region=saved_region)
        assert segment.name == "Named Street"
        assert segment.category == "residential"
        assert segment.surface == "cobblestone"
        assert segment.accessible is True
        assert segment.is_lit is True

    def test_path_segment_join_records_created(self, saved_region: Region) -> None:
        """PathSegment records link back correctly."""
        paths = self._create_crossing_paths(saved_region)

        call_command("load_segments", "--region-code", saved_region.code)

        for path in paths:
            assert PathSegment.objects.filter(path=path).count() >= 1

        total_joins = PathSegment.objects.filter(segment__region=saved_region).count()
        # 2 paths crossing produce 4 segments; the intersection segment
        # belongs to both parents, so we get at least 5 joins.
        assert total_joins >= 4

    def test_dry_run_creates_no_records(self, saved_region: Region) -> None:
        """Dry run does not write segments or join records."""
        self._create_crossing_paths(saved_region)

        call_command("load_segments", "--region-code", saved_region.code, "--dry-run")

        assert Segment.objects.filter(region=saved_region).count() == 0
        assert PathSegment.objects.count() == 0


@pytest.mark.django_db
class TestLoadSegmentsEdgeCases:
    """Edge-case tests for the load_segments noding algorithm."""

    def test_single_path_produces_one_segment(self, saved_region: Region) -> None:
        """A single isolated path produces exactly one segment."""
        Path.objects.create(
            region=saved_region,
            name="Isolated",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.0 50.0, 20.001 50.001))",
                srid=4326,
            ),
            category="footway",
        )

        call_command("load_segments", "--region-code", saved_region.code)

        assert Segment.objects.filter(region=saved_region).count() == 1

    def test_closed_loop_path(self, saved_region: Region) -> None:
        """A closed loop path is noded as a single segment."""
        Path.objects.create(
            region=saved_region,
            name="Loop",
            geometry=GEOSGeometry(
                "MULTILINESTRING(("
                "20.0 50.0, 20.001 50.0, 20.001 50.001, "
                "20.0 50.001, 20.0 50.0))",
                srid=4326,
            ),
            category="footway",
        )

        call_command("load_segments", "--region-code", saved_region.code)

        # A single closed ring with no other paths stays as one segment
        assert Segment.objects.filter(region=saved_region).count() == 1

    def test_self_intersecting_path(self, saved_region: Region) -> None:
        """A self-intersecting (figure-8) path is split at the crossing."""
        Path.objects.create(
            region=saved_region,
            name="Figure 8",
            geometry=GEOSGeometry(
                "MULTILINESTRING(("
                "20.0 50.0, 20.002 50.002, "
                "20.0 50.002, 20.002 50.0, 20.0 50.0))",
                srid=4326,
            ),
            category="footway",
        )

        call_command("load_segments", "--region-code", saved_region.code)

        # Self-intersection splits into at least 2 segments
        assert Segment.objects.filter(region=saved_region).count() >= 2

    def test_multilinestring_with_multiple_parts(self, saved_region: Region) -> None:
        """A MultiLineString with multiple disjoint parts produces one segment each."""
        Path.objects.create(
            region=saved_region,
            name="Multipart",
            geometry=GEOSGeometry(
                "MULTILINESTRING("
                "(20.000 50.000, 20.001 50.000),"
                "(20.010 50.010, 20.011 50.010))",
                srid=4326,
            ),
            category="footway",
        )

        call_command("load_segments", "--region-code", saved_region.code)

        assert Segment.objects.filter(region=saved_region).count() == 2
