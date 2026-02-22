"""Tests for data.providers.geoportal spatial helpers."""

from pathlib import Path as FilePath

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString, Polygon

from data.providers.geoportal import _assign_admin_district, _load_admin_boundaries


class TestLoadAdminBoundaries:
    """Tests for _load_admin_boundaries."""

    def test_reprojects_to_4326_and_renames_columns(self, tmp_path: FilePath) -> None:
        """Loaded GDF is in EPSG:4326 with standardised column names."""
        poly = Polygon([(2e6, 6e6), (2.1e6, 6e6), (2.1e6, 6.1e6), (2e6, 6e6)])
        gdf = gpd.GeoDataFrame(
            {"JPT_NAZWA_": ["Mazowieckie"], "JPT_KOD_JE": ["14"], "geometry": [poly]},
            crs="EPSG:3857",
        )
        path = tmp_path / "admin.gpkg"
        layer = "test_layer"
        gdf.to_file(path, layer=layer, driver="GPKG")

        result = _load_admin_boundaries(
            str(path),
            layer=layer,
            name_col="JPT_NAZWA_",
            code_col="JPT_KOD_JE",
        )

        assert result.crs.to_epsg() == 4326
        assert list(result.columns) == ["admin_name", "admin_code", "geometry"]
        assert result.iloc[0]["admin_name"] == "Mazowieckie"
        assert result.iloc[0]["admin_code"] == "14"


class TestAssignAdminDistrict:
    """Tests for _assign_admin_district."""

    @staticmethod
    def _make_streets(
        region_codes: list[str],
        geometries: list[LineString],
    ) -> gpd.GeoDataFrame:
        return gpd.GeoDataFrame(
            {"region_code": region_codes, "geometry": geometries},
            crs="EPSG:4326",
        )

    @staticmethod
    def _make_admin(
        names: list[str],
        geometries: list[Polygon],
    ) -> gpd.GeoDataFrame:
        return gpd.GeoDataFrame(
            {"admin_name": names, "geometry": geometries},
            crs="EPSG:4326",
        )

    def test_picks_longest(self) -> None:
        """Region is assigned to the admin district with the most street length."""
        # Admin A covers left half, Admin B covers right half
        admin_a = Polygon([(19, 50), (20, 50), (20, 52), (19, 52)])
        admin_b = Polygon([(20, 50), (21, 50), (21, 52), (20, 52)])

        # Street mostly in Admin B (short in A, long in B)
        short_in_a = LineString([(19.9, 51), (20, 51)])
        long_in_b = LineString([(20, 51), (20.8, 51)])

        streets = self._make_streets(["R1", "R1"], [short_in_a, long_in_b])
        admin = self._make_admin(["A", "B"], [admin_a, admin_b])

        result = _assign_admin_district(streets, admin)

        assert result["R1"] == "B"

    def test_multiple_regions(self) -> None:
        """Different regions can map to different districts."""
        admin_left = Polygon([(19, 50), (20, 50), (20, 52), (19, 52)])
        admin_right = Polygon([(20, 50), (21, 50), (21, 52), (20, 52)])

        street_left = LineString([(19.2, 51), (19.8, 51)])
        street_right = LineString([(20.2, 51), (20.8, 51)])

        streets = self._make_streets(["R1", "R2"], [street_left, street_right])
        admin = self._make_admin(["Left", "Right"], [admin_left, admin_right])

        result = _assign_admin_district(streets, admin)

        assert result["R1"] == "Left"
        assert result["R2"] == "Right"

    def test_no_match_excluded(self) -> None:
        """Regions with no intersection are absent from the result."""
        admin_poly = Polygon([(19, 50), (20, 50), (20, 52), (19, 52)])
        street_outside = LineString([(25, 55), (26, 55)])

        streets = self._make_streets(["R1"], [street_outside])
        admin = self._make_admin(["A"], [admin_poly])

        result = _assign_admin_district(streets, admin)

        assert isinstance(result, pd.Series)
        assert "R1" not in result.index
