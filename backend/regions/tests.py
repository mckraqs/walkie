"""Tests for the regions app."""

from pathlib import Path as FilePath

import pytest
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from rest_framework.test import APIClient

from regions.management.commands.load_regions import Command
from regions.models import Region

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((20.0 50.0, 21.0 50.0, 21.0 51.0, 20.0 51.0, 20.0 50.0)))"
)


@pytest.fixture
def command() -> Command:
    """Return a fresh Command instance."""
    return Command()


class TestParseAndBuild:
    """Tests for _parse_boundary and _build_region_objects."""

    def test_parse_boundary_polygon_wkt(self, command: Command) -> None:
        """A Polygon WKT is promoted to MultiPolygon."""
        wkt = "POLYGON((20 50, 21 50, 21 51, 20 51, 20 50))"
        result = command._parse_boundary(wkt)

        assert isinstance(result, MultiPolygon)

    def test_parse_boundary_multipolygon_wkt(self, command: Command) -> None:
        """A MultiPolygon WKT is returned as-is."""
        wkt = "MULTIPOLYGON(((20 50, 21 50, 21 51, 20 51, 20 50)))"
        result = command._parse_boundary(wkt)

        assert isinstance(result, MultiPolygon)

    def test_parse_boundary_linestring_buffered(self, command: Command) -> None:
        """A LineString WKT is buffered and returned as MultiPolygon."""
        wkt = "LINESTRING(20 50, 21 51)"
        result = command._parse_boundary(wkt)

        assert isinstance(result, MultiPolygon)

    def test_parse_boundary_invalid_wkt(self, command: Command) -> None:
        """Invalid WKT raises GEOSException."""
        with pytest.raises(Exception, match="String input unrecognized"):
            command._parse_boundary("NOT_A_WKT")

    def test_build_region_objects_valid_rows(self, command: Command) -> None:
        """Valid CSV rows produce correct Region objects with admin districts."""
        rows = [
            {
                "region_code": "001",
                "name": "Region A",
                "boundary_wkt": "POLYGON((20 50, 21 50, 21 51, 20 51, 20 50))",
                "administrative_district_lvl_1": "mazowieckie",
                "administrative_district_lvl_2": "Warszawa",
            },
            {
                "region_code": "002",
                "name": "Region B",
                "boundary_wkt": "POLYGON((22 52, 23 52, 23 53, 22 53, 22 52))",
                "administrative_district_lvl_1": "malopolskie",
                "administrative_district_lvl_2": "Krakow",
            },
        ]
        region_objects, skipped = command._build_region_objects(rows)

        assert len(region_objects) == 2
        assert skipped == 0
        assert region_objects[0].code == "001"
        assert region_objects[0].name == "Region A"
        assert isinstance(region_objects[0].boundary, MultiPolygon | GEOSGeometry)
        assert region_objects[0].administrative_district_lvl_1 == "mazowieckie"
        assert region_objects[0].administrative_district_lvl_2 == "Warszawa"

    def test_build_region_objects_missing_admin_columns(self, command: Command) -> None:
        """CSV rows without admin columns default to empty strings."""
        rows = [
            {
                "region_code": "001",
                "name": "Region A",
                "boundary_wkt": "POLYGON((20 50, 21 50, 21 51, 20 51, 20 50))",
            },
        ]
        region_objects, skipped = command._build_region_objects(rows)

        assert len(region_objects) == 1
        assert skipped == 0
        assert region_objects[0].administrative_district_lvl_1 == ""
        assert region_objects[0].administrative_district_lvl_2 == ""

    def test_build_region_objects_invalid_boundary(self, command: Command) -> None:
        """Invalid boundary WKT increments skipped count."""
        rows = [
            {
                "region_code": "001",
                "name": "Bad Region",
                "boundary_wkt": "INVALID_WKT",
            },
        ]
        region_objects, skipped = command._build_region_objects(rows)

        assert len(region_objects) == 0
        assert skipped == 1


class TestValidateFile:
    """Tests for _validate_file."""

    def test_nonexistent_path(self, command: Command) -> None:
        """FileNotFoundError for nonexistent path."""
        with pytest.raises(FileNotFoundError, match="File not found"):
            command._validate_file(FilePath("/nonexistent/file.csv"))

    def test_wrong_extension(self, command: Command, tmp_path: FilePath) -> None:
        """ValueError for non-.csv extension."""
        bad_file = tmp_path / "data.txt"
        bad_file.touch()

        with pytest.raises(ValueError, match=r"Expected a \.csv file"):
            command._validate_file(bad_file)


@pytest.mark.django_db
class TestRegionDetailView:
    """Tests for the GET /api/regions/{id}/ endpoint."""

    def test_returns_geojson_feature(
        self, saved_region: Region, auth_client: APIClient
    ) -> None:
        """Endpoint returns a GeoJSON Feature with correct properties."""
        response = auth_client.get(f"/api/regions/{saved_region.pk}/")

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "Feature"
        assert data["geometry"]["type"] == "MultiPolygon"
        assert data["properties"]["code"] == saved_region.code
        assert data["properties"]["name"] == saved_region.name
        assert (
            data["properties"]["administrative_district_lvl_1"]
            == saved_region.administrative_district_lvl_1
        )
        assert (
            data["properties"]["administrative_district_lvl_2"]
            == saved_region.administrative_district_lvl_2
        )
        assert "created_at" in data["properties"]
        assert "updated_at" in data["properties"]
        assert "is_favorite" in data["properties"]

    def test_nonexistent_region_returns_404(self, auth_client: APIClient) -> None:
        """Endpoint returns 404 for a nonexistent region ID."""
        response = auth_client.get("/api/regions/999999/")

        assert response.status_code == 404

    def test_unauthenticated_returns_401(self, saved_region: Region) -> None:
        """Endpoint returns 401 for unauthenticated access."""
        client = APIClient()
        response = client.get(f"/api/regions/{saved_region.pk}/")

        assert response.status_code == 401


@pytest.mark.django_db
class TestRegionListView:
    """Tests for the GET /api/regions/ endpoint."""

    def test_returns_flat_json_list(
        self, saved_region: Region, auth_client: APIClient
    ) -> None:
        """Endpoint returns a JSON array with expected fields, no boundary."""
        response = auth_client.get("/api/regions/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        item = data[0]
        assert item["id"] == saved_region.pk
        assert item["code"] == saved_region.code
        assert item["name"] == saved_region.name
        assert (
            item["administrative_district_lvl_1"]
            == saved_region.administrative_district_lvl_1
        )
        assert (
            item["administrative_district_lvl_2"]
            == saved_region.administrative_district_lvl_2
        )
        assert "boundary" not in item
        assert "geometry" not in item
        assert "is_favorite" in item

    def test_empty_database_returns_empty_list(self, auth_client: APIClient) -> None:
        """Endpoint returns an empty list when no regions exist."""
        response = auth_client.get("/api/regions/")

        assert response.status_code == 200
        assert response.json() == []

    def test_unauthenticated_returns_401(self) -> None:
        """Endpoint returns 401 for unauthenticated access."""
        client = APIClient()
        response = client.get("/api/regions/")

        assert response.status_code == 401
