"""Tests for the paths app -- load_streets management command."""

from pathlib import Path as FilePath
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from paths.management.commands.load_streets import Command
from paths.models import Path
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
