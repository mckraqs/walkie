"""Tests for data.providers.osm_preview module."""

from pathlib import Path as FilePath

import geopandas as gpd

from data.providers.osm import RegionType
from data.providers.osm_preview import build_preview_gdf

PREVIEW_EXTRA_COLUMNS = {
    "osm_id",
    "tracktype",
    "sac_scale",
    "trail_visibility",
    "foot",
    "access",
    "surface_raw",
}


class TestBuildPreviewGdf:
    """Tests for build_preview_gdf."""

    @staticmethod
    def _make_way(
        way_id: int = 1,
        tags: dict[str, str] | None = None,
        coords: list[dict[str, float]] | None = None,
    ) -> dict:
        if tags is None:
            tags = {"highway": "path", "surface": "dirt", "tracktype": "grade2"}
        if coords is None:
            coords = [{"lat": 51.0, "lon": 20.0}, {"lat": 51.1, "lon": 20.1}]
        return {"type": "way", "id": way_id, "tags": tags, "geometry": coords}

    def test_produces_gpkg_with_extra_columns(self, tmp_path: FilePath) -> None:
        """Preview GeoDataFrame includes OSM metadata columns."""
        way = self._make_way(
            tags={
                "highway": "track",
                "surface": "gravel",
                "tracktype": "grade3",
                "sac_scale": "hiking",
            },
        )
        gdf = build_preview_gdf([way], region_type=RegionType.WILDLIFE)

        assert len(gdf) == 1
        for col in PREVIEW_EXTRA_COLUMNS:
            assert col in gdf.columns, f"Missing column: {col}"

        row = gdf.iloc[0]
        assert row["tracktype"] == "grade3"
        assert row["sac_scale"] == "hiking"
        assert row["surface_raw"] == "gravel"
        assert row["surface"] == "gravel"

    def test_empty_result_does_not_crash(self) -> None:
        """Empty input produces an empty GeoDataFrame without errors."""
        gdf = build_preview_gdf([], region_type=RegionType.WILDLIFE)
        assert len(gdf) == 0
        assert gdf.crs is not None
        assert gdf.crs.to_epsg() == 4326
        for col in PREVIEW_EXTRA_COLUMNS:
            assert col in gdf.columns, f"Missing column: {col}"

    def test_writes_readable_gpkg(self, tmp_path: FilePath) -> None:
        """Preview GeoDataFrame can be written to and read from .gpkg."""
        way = self._make_way(
            way_id=42,
            tags={"highway": "footway", "name": "Trail A"},
        )
        gdf = build_preview_gdf([way], region_type=RegionType.WILDLIFE)
        path = tmp_path / "preview.gpkg"
        gdf.to_file(str(path), driver="GPKG")

        result = gpd.read_file(path)
        assert len(result) == 1
        assert result.iloc[0]["osm_id"] == 42
        assert result.iloc[0]["name"] == "Trail A"

    def test_wildlife_unnamed_included(self) -> None:
        """Wildlife mode includes unnamed ways."""
        way = self._make_way(tags={"highway": "path"})
        gdf = build_preview_gdf([way], region_type=RegionType.WILDLIFE)
        assert len(gdf) == 1
        assert gdf.iloc[0]["name"] == ""

    def test_city_mode_excludes_unnamed(self) -> None:
        """City mode excludes unnamed ways."""
        way = self._make_way(tags={"highway": "residential"})
        gdf = build_preview_gdf([way], region_type=RegionType.CITY)
        assert len(gdf) == 0

    def test_excludes_foot_no(self) -> None:
        """Ways with foot=no are excluded in preview."""
        way = self._make_way(tags={"highway": "path", "foot": "no"})
        gdf = build_preview_gdf([way], region_type=RegionType.WILDLIFE)
        assert len(gdf) == 0
