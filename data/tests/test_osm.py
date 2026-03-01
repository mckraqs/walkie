"""Tests for data.providers.osm module."""

import csv
from pathlib import Path as FilePath
from unittest.mock import MagicMock, patch

import geopandas as gpd
import pytest
from shapely.geometry import MultiLineString

from data.providers.osm import (
    WALKING_HIGHWAY_TYPES,
    WILDLIFE_HIGHWAY_TYPES,
    RegionInfo,
    RegionType,
    _assemble_boundary,
    _build_parent_admin_query,
    _build_relation_query,
    _build_streets_gdf,
    _build_ways_query,
    _normalize_surface,
    _parse_way_geometry,
    _should_exclude_way,
    _write_region_csv,
    _write_streets_gpkg,
)

EXPECTED_COLUMNS = {
    "name",
    "geometry",
    "category",
    "surface",
    "accessible",
    "is_lit",
    "region_code",
}


class TestBuildWaysQuery:
    """Tests for _build_ways_query."""

    def test_contains_area_id(self) -> None:
        """Query includes the computed area ID."""
        query = _build_ways_query(2420076)
        assert "area(id:3602420076)" in query

    def test_contains_highway_regex(self) -> None:
        """Query includes the highway type regex."""
        query = _build_ways_query(1)
        assert '"highway"~' in query
        assert "residential" in query
        assert "tertiary" in query

    def test_uses_out_geom(self) -> None:
        """Query requests full geometry output."""
        query = _build_ways_query(1)
        assert "out geom;" in query

    def test_default_uses_walking_types(self) -> None:
        """Default query uses WALKING_HIGHWAY_TYPES."""
        query = _build_ways_query(1)
        for ht in WALKING_HIGHWAY_TYPES:
            assert ht in query

    def test_wildlife_types_in_query(self) -> None:
        """Wildlife highway types appear in query when passed."""
        query = _build_ways_query(1, highway_types=WILDLIFE_HIGHWAY_TYPES)
        for ht in WILDLIFE_HIGHWAY_TYPES:
            assert ht in query
        assert "residential" not in query


class TestBuildRelationQuery:
    """Tests for _build_relation_query."""

    def test_contains_relation_id(self) -> None:
        """Query includes the relation ID."""
        query = _build_relation_query(2420076)
        assert "relation(2420076)" in query


class TestBuildParentAdminQuery:
    """Tests for _build_parent_admin_query."""

    def test_contains_admin_level(self) -> None:
        """Query filters by admin_level."""
        query = _build_parent_admin_query(123, 4)
        assert '"admin_level"="4"' in query

    def test_contains_relation_id(self) -> None:
        """Query starts from the given relation."""
        query = _build_parent_admin_query(456, 6)
        assert "relation(456)" in query


class TestShouldExcludeWay:
    """Tests for _should_exclude_way."""

    def test_excludes_unnamed(self) -> None:
        """Ways without a name tag are excluded."""
        assert _should_exclude_way({"highway": "residential"}) is True

    def test_excludes_empty_name(self) -> None:
        """Ways with an empty name are excluded."""
        assert _should_exclude_way({"name": ""}) is True

    def test_excludes_area_yes(self) -> None:
        """Ways with area=yes are excluded."""
        assert _should_exclude_way({"name": "X", "area": "yes"}) is True

    def test_excludes_foot_no(self) -> None:
        """Ways with foot=no are excluded."""
        assert _should_exclude_way({"name": "X", "foot": "no"}) is True

    def test_excludes_access_private(self) -> None:
        """Ways with access=private are excluded."""
        assert _should_exclude_way({"name": "X", "access": "private"}) is True

    def test_excludes_access_no(self) -> None:
        """Ways with access=no are excluded."""
        assert _should_exclude_way({"name": "X", "access": "no"}) is True

    def test_allows_named_way(self) -> None:
        """Named highway ways pass the filter."""
        assert (
            _should_exclude_way({"name": "Main St", "highway": "residential"}) is False
        )

    def test_allows_empty_tags_with_name(self) -> None:
        """Ways with only a name tag pass the filter."""
        assert _should_exclude_way({"name": "Some Road"}) is False

    def test_wildlife_allows_unnamed(self) -> None:
        """Wildlife mode does not exclude unnamed ways."""
        assert (
            _should_exclude_way(
                {"highway": "path"}, region_type=RegionType.WILDLIFE
            )
            is False
        )

    def test_wildlife_excludes_foot_no(self) -> None:
        """Wildlife mode still excludes ways with foot=no."""
        assert (
            _should_exclude_way(
                {"highway": "track", "foot": "no"}, region_type=RegionType.WILDLIFE
            )
            is True
        )

    def test_wildlife_excludes_access_private(self) -> None:
        """Wildlife mode still excludes ways with access=private."""
        assert (
            _should_exclude_way(
                {"highway": "path", "access": "private"},
                region_type=RegionType.WILDLIFE,
            )
            is True
        )

    def test_wildlife_excludes_area_yes(self) -> None:
        """Wildlife mode still excludes ways with area=yes."""
        assert (
            _should_exclude_way(
                {"highway": "footway", "area": "yes"},
                region_type=RegionType.WILDLIFE,
            )
            is True
        )

    def test_city_still_excludes_unnamed(self) -> None:
        """Explicit CITY region type excludes unnamed ways."""
        assert (
            _should_exclude_way(
                {"highway": "residential"}, region_type=RegionType.CITY
            )
            is True
        )


class TestParseWayGeometry:
    """Tests for _parse_way_geometry."""

    def test_valid_coords(self) -> None:
        """Two or more points produce a MultiLineString."""
        coords = [{"lat": 50.0, "lon": 19.0}, {"lat": 50.1, "lon": 19.1}]
        result = _parse_way_geometry(coords)
        assert isinstance(result, MultiLineString)
        assert not result.is_empty

    def test_single_point_returns_none(self) -> None:
        """A single point is insufficient for a line."""
        result = _parse_way_geometry([{"lat": 50.0, "lon": 19.0}])
        assert result is None

    def test_empty_returns_none(self) -> None:
        """Empty coordinate list returns None."""
        result = _parse_way_geometry([])
        assert result is None

    def test_coord_order_is_lon_lat(self) -> None:
        """Coordinates are stored as (lon, lat)."""
        coords = [{"lat": 50.0, "lon": 19.0}, {"lat": 51.0, "lon": 20.0}]
        result = _parse_way_geometry(coords)
        assert result is not None
        line = next(iter(result.geoms))
        assert line.coords[0] == (19.0, 50.0)
        assert line.coords[1] == (20.0, 51.0)


class TestNormalizeSurface:
    """Tests for _normalize_surface."""

    def test_asphalt_is_paved(self) -> None:
        """Asphalt maps to paved."""
        assert _normalize_surface("asphalt") == "paved"

    def test_gravel_is_gravel(self) -> None:
        """Gravel maps to gravel."""
        assert _normalize_surface("gravel") == "gravel"

    def test_dirt_is_unpaved(self) -> None:
        """Dirt maps to unpaved."""
        assert _normalize_surface("dirt") == "unpaved"

    def test_unknown_returns_empty(self) -> None:
        """Unknown surface values map to empty string."""
        assert _normalize_surface("rubber") == ""

    def test_empty_returns_empty(self) -> None:
        """Empty string maps to empty string."""
        assert _normalize_surface("") == ""


class TestBuildStreetsGdf:
    """Tests for _build_streets_gdf."""

    @staticmethod
    def _make_way(
        way_id: int = 1,
        tags: dict[str, str] | None = None,
        coords: list[dict[str, float]] | None = None,
    ) -> dict:
        if tags is None:
            tags = {"highway": "residential", "name": "Test Street"}
        if coords is None:
            coords = [{"lat": 50.0, "lon": 19.0}, {"lat": 50.1, "lon": 19.1}]
        return {"type": "way", "id": way_id, "tags": tags, "geometry": coords}

    def test_output_columns(self) -> None:
        """GeoDataFrame has all required columns."""
        way = self._make_way()
        gdf = _build_streets_gdf([way], "osm_123")
        expected = EXPECTED_COLUMNS
        assert expected == set(gdf.columns)

    def test_crs_is_4326(self) -> None:
        """Output CRS is EPSG:4326."""
        way = self._make_way()
        gdf = _build_streets_gdf([way], "osm_123")
        assert gdf.crs is not None
        assert gdf.crs.to_epsg() == 4326

    def test_tag_mapping(self) -> None:
        """OSM tags are correctly mapped to Path model fields."""
        way = self._make_way(
            tags={
                "highway": "footway",
                "name": "Park Path",
                "surface": "asphalt",
                "lit": "yes",
                "wheelchair": "yes",
            },
        )
        gdf = _build_streets_gdf([way], "osm_42")
        row = gdf.iloc[0]
        assert row["name"] == "Park Path"
        assert row["category"] == "footway"
        assert row["surface"] == "paved"
        assert row["is_lit"] == True  # noqa: E712
        assert row["accessible"] == True  # noqa: E712
        assert row["region_code"] == "osm_42"

    def test_default_values(self) -> None:
        """Missing optional tags produce correct defaults."""
        way = self._make_way(tags={"highway": "residential", "name": "Test Rd"})
        gdf = _build_streets_gdf([way], "osm_1")
        row = gdf.iloc[0]
        assert row["name"] == "Test Rd"
        assert row["surface"] == ""
        assert row["is_lit"] == False  # noqa: E712
        assert row["accessible"] == False  # noqa: E712

    def test_filters_unnamed(self) -> None:
        """Ways without a name are excluded."""
        way = self._make_way(tags={"highway": "residential"})
        gdf = _build_streets_gdf([way], "osm_1")
        assert len(gdf) == 0

    def test_filters_area_yes(self) -> None:
        """Ways with area=yes are excluded."""
        way = self._make_way(tags={"highway": "pedestrian", "name": "X", "area": "yes"})
        gdf = _build_streets_gdf([way], "osm_1")
        assert len(gdf) == 0

    def test_filters_foot_no(self) -> None:
        """Ways with foot=no are excluded."""
        way = self._make_way(tags={"highway": "cycleway", "name": "X", "foot": "no"})
        gdf = _build_streets_gdf([way], "osm_1")
        assert len(gdf) == 0

    def test_filters_access_private(self) -> None:
        """Ways with access=private are excluded."""
        way = self._make_way(
            tags={"highway": "service", "name": "X", "access": "private"}
        )
        gdf = _build_streets_gdf([way], "osm_1")
        assert len(gdf) == 0

    def test_filters_short_geometry(self) -> None:
        """Ways with fewer than 2 coordinate points are excluded."""
        way = self._make_way(coords=[{"lat": 50.0, "lon": 19.0}])
        gdf = _build_streets_gdf([way], "osm_1")
        assert len(gdf) == 0

    def test_empty_input(self) -> None:
        """Empty input produces empty GeoDataFrame with correct schema."""
        gdf = _build_streets_gdf([], "osm_1")
        expected = EXPECTED_COLUMNS
        assert expected == set(gdf.columns)
        assert len(gdf) == 0
        assert gdf.crs is not None
        assert gdf.crs.to_epsg() == 4326

    def test_wildlife_includes_unnamed(self) -> None:
        """Wildlife mode includes unnamed ways with correct category."""
        way = self._make_way(tags={"highway": "track", "surface": "dirt"})
        gdf = _build_streets_gdf([way], "osm_1", region_type=RegionType.WILDLIFE)
        assert len(gdf) == 1
        row = gdf.iloc[0]
        assert row["name"] == ""
        assert row["category"] == "track"
        assert row["surface"] == "unpaved"

    def test_wildlife_filters_foot_no(self) -> None:
        """Wildlife mode still excludes ways with foot=no."""
        way = self._make_way(tags={"highway": "path", "foot": "no"})
        gdf = _build_streets_gdf([way], "osm_1", region_type=RegionType.WILDLIFE)
        assert len(gdf) == 0


class TestAssembleBoundary:
    """Tests for _assemble_boundary."""

    @staticmethod
    def _make_relation_element(
        members: list[dict],
        tags: dict[str, str] | None = None,
    ) -> dict:
        return {
            "type": "relation",
            "tags": tags or {},
            "members": members,
        }

    @staticmethod
    def _make_way_member(
        coords: list[tuple[float, float]],
        role: str = "outer",
    ) -> dict:
        return {
            "type": "way",
            "role": role,
            "geometry": [{"lon": c[0], "lat": c[1]} for c in coords],
        }

    def test_closed_ring_produces_polygon(self) -> None:
        """Closed ring of Ways produces a valid polygon WKT."""
        coords_a = [(0, 0), (1, 0)]
        coords_b = [(1, 0), (1, 1)]
        coords_c = [(1, 1), (0, 1)]
        coords_d = [(0, 1), (0, 0)]
        members = [
            self._make_way_member(coords_a),
            self._make_way_member(coords_b),
            self._make_way_member(coords_c),
            self._make_way_member(coords_d),
        ]
        element = self._make_relation_element(members)
        wkt = _assemble_boundary([element])
        assert "POLYGON" in wkt

    def test_open_ring_falls_back_to_convex_hull(self) -> None:
        """Non-closed Ways fall back to convex hull."""
        members = [
            self._make_way_member([(0, 0), (1, 0)]),
            self._make_way_member([(2, 2), (3, 3)]),
        ]
        element = self._make_relation_element(members)
        wkt = _assemble_boundary([element])
        assert "POLYGON" in wkt or "POINT" in wkt or "LINESTRING" in wkt

    def test_no_outer_ways_raises(self) -> None:
        """Relation with no outer Ways raises ValueError."""
        element = self._make_relation_element([])
        with pytest.raises(ValueError, match="No outer boundary"):
            _assemble_boundary([element])

    def test_inner_role_ignored(self) -> None:
        """Members with role=inner are not included."""
        members = [self._make_way_member([(0, 0), (1, 0)], role="inner")]
        element = self._make_relation_element(members)
        with pytest.raises(ValueError, match="No outer boundary"):
            _assemble_boundary([element])


class TestWriteStreetsGpkg:
    """Tests for _write_streets_gpkg."""

    def test_writes_readable_gpkg(self, tmp_path: FilePath) -> None:
        """Written file can be read back with correct columns."""
        gdf = gpd.GeoDataFrame(
            {
                "name": ["A"],
                "geometry": [MultiLineString([[(0, 0), (1, 1)]])],
                "category": ["footway"],
                "surface": ["paved"],
                "accessible": [True],
                "is_lit": [False],
                "region_code": ["osm_1"],
            },
            geometry="geometry",
            crs="EPSG:4326",
        )
        path = tmp_path / "streets.gpkg"
        _write_streets_gpkg(gdf, str(path))

        result = gpd.read_file(path)
        expected = EXPECTED_COLUMNS
        assert expected == set(result.columns)
        assert len(result) == 1
        assert result.crs is not None
        assert result.crs.to_epsg() == 4326


class TestWriteRegionCsv:
    """Tests for _write_region_csv."""

    def test_writes_correct_columns(self, tmp_path: FilePath) -> None:
        """CSV has all required columns."""
        info = RegionInfo(
            region_code="osm_123",
            name="TestCity",
            boundary_wkt="POLYGON ((0 0, 1 0, 1 1, 0 0))",
            administrative_district_lvl_1="Voivodeship",
            administrative_district_lvl_2="District",
        )
        path = tmp_path / "regions.csv"
        _write_region_csv(info, str(path))

        with open(path) as f:
            reader = csv.DictReader(f)
            assert reader.fieldnames is not None
            assert set(reader.fieldnames) == {
                "region_code",
                "name",
                "boundary_wkt",
                "administrative_district_lvl_1",
                "administrative_district_lvl_2",
            }
            rows = list(reader)

        assert len(rows) == 1
        assert rows[0]["region_code"] == "osm_123"
        assert rows[0]["name"] == "TestCity"
        assert rows[0]["boundary_wkt"] == "POLYGON ((0 0, 1 0, 1 1, 0 0))"
        assert rows[0]["administrative_district_lvl_1"] == "Voivodeship"
        assert rows[0]["administrative_district_lvl_2"] == "District"

    def test_empty_admin_districts(self, tmp_path: FilePath) -> None:
        """Empty admin districts are written as empty strings."""
        info = RegionInfo(
            region_code="osm_1",
            name="Town",
            boundary_wkt="POLYGON ((0 0, 1 0, 1 1, 0 0))",
            administrative_district_lvl_1="",
            administrative_district_lvl_2="",
        )
        path = tmp_path / "regions.csv"
        _write_region_csv(info, str(path))

        with open(path) as f:
            rows = list(csv.DictReader(f))

        assert rows[0]["administrative_district_lvl_1"] == ""
        assert rows[0]["administrative_district_lvl_2"] == ""


class TestDownloadAndTransform:
    """Integration tests for the full orchestrator with mocked HTTP."""

    @staticmethod
    def _mock_overpass_ways_response() -> dict:
        return {
            "elements": [
                {
                    "type": "way",
                    "id": 100,
                    "tags": {
                        "highway": "footway",
                        "name": "Park Path",
                        "surface": "asphalt",
                        "lit": "yes",
                    },
                    "geometry": [
                        {"lat": 50.0, "lon": 19.0},
                        {"lat": 50.1, "lon": 19.1},
                    ],
                },
            ],
        }

    @staticmethod
    def _mock_overpass_relation_response() -> dict:
        return {
            "elements": [
                {
                    "type": "relation",
                    "id": 999,
                    "tags": {"name": "TestTown"},
                    "members": [
                        {
                            "type": "way",
                            "role": "outer",
                            "geometry": [
                                {"lon": 0, "lat": 0},
                                {"lon": 1, "lat": 0},
                            ],
                        },
                        {
                            "type": "way",
                            "role": "outer",
                            "geometry": [
                                {"lon": 1, "lat": 0},
                                {"lon": 1, "lat": 1},
                            ],
                        },
                        {
                            "type": "way",
                            "role": "outer",
                            "geometry": [
                                {"lon": 1, "lat": 1},
                                {"lon": 0, "lat": 1},
                            ],
                        },
                        {
                            "type": "way",
                            "role": "outer",
                            "geometry": [
                                {"lon": 0, "lat": 1},
                                {"lon": 0, "lat": 0},
                            ],
                        },
                    ],
                },
            ],
        }

    @staticmethod
    def _mock_overpass_admin_response(name: str, admin_level: str) -> dict:
        return {
            "elements": [
                {
                    "type": "relation",
                    "id": 50,
                    "tags": {"name": name, "admin_level": admin_level},
                },
            ],
        }

    @patch("data.providers.osm._overpass_post")
    def test_produces_valid_outputs(
        self,
        mock_post: MagicMock,
        tmp_path: FilePath,
    ) -> None:
        """Full pipeline produces valid GPKG and CSV files."""
        from data.providers.osm import download_and_transform

        mock_post.side_effect = [
            self._mock_overpass_ways_response(),
            self._mock_overpass_relation_response(),
            self._mock_overpass_admin_response("Mazowieckie", "4"),
            self._mock_overpass_admin_response("Powiat X", "6"),
        ]

        streets_path = tmp_path / "streets.gpkg"
        regions_path = tmp_path / "regions.csv"

        download_and_transform(
            relation_id=999,
            streets_output_path=str(streets_path),
            regions_output_path=str(regions_path),
        )

        gdf = gpd.read_file(streets_path)
        assert len(gdf) == 1
        assert gdf.iloc[0]["name"] == "Park Path"
        assert gdf.iloc[0]["category"] == "footway"
        assert gdf.iloc[0]["region_code"] == "osm_999"

        with open(regions_path) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]["region_code"] == "osm_999"
        assert rows[0]["name"] == "TestTown"
        assert rows[0]["administrative_district_lvl_1"] == "Mazowieckie"
        assert rows[0]["administrative_district_lvl_2"] == "Powiat X"

    @patch("data.providers.osm._overpass_post")
    def test_wildlife_mode(
        self,
        mock_post: MagicMock,
        tmp_path: FilePath,
    ) -> None:
        """Wildlife mode includes unnamed tracks and named paths."""
        from data.providers.osm import RegionType, download_and_transform

        wildlife_ways_response = {
            "elements": [
                {
                    "type": "way",
                    "id": 200,
                    "tags": {"highway": "track", "surface": "dirt"},
                    "geometry": [
                        {"lat": 51.0, "lon": 20.0},
                        {"lat": 51.1, "lon": 20.1},
                    ],
                },
                {
                    "type": "way",
                    "id": 201,
                    "tags": {
                        "highway": "path",
                        "name": "Forest Trail",
                        "surface": "ground",
                    },
                    "geometry": [
                        {"lat": 51.2, "lon": 20.2},
                        {"lat": 51.3, "lon": 20.3},
                    ],
                },
            ],
        }

        mock_post.side_effect = [
            wildlife_ways_response,
            self._mock_overpass_relation_response(),
            self._mock_overpass_admin_response("Mazowieckie", "4"),
            self._mock_overpass_admin_response("Powiat X", "6"),
        ]

        streets_path = tmp_path / "streets.gpkg"
        regions_path = tmp_path / "regions.csv"

        download_and_transform(
            relation_id=999,
            streets_output_path=str(streets_path),
            regions_output_path=str(regions_path),
            region_type=RegionType.WILDLIFE,
        )

        gdf = gpd.read_file(streets_path)
        assert len(gdf) == 2
        categories = set(gdf["category"])
        assert categories == {"track", "path"}
        unnamed = gdf[gdf["name"] == ""]
        assert len(unnamed) == 1
        assert unnamed.iloc[0]["category"] == "track"
