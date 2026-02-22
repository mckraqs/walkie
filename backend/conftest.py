"""Shared test fixtures for the backend Django apps."""

import pytest
from django.contrib.gis.geos import GEOSGeometry

from paths.models import Path
from regions.models import Region

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((20.0 50.0, 21.0 50.0, 21.0 51.0, 20.0 51.0, 20.0 50.0)))"
)
SAMPLE_LINESTRING_WKT = "MULTILINESTRING((20.0 50.0, 21.0 51.0))"


@pytest.fixture
def sample_region() -> Region:
    """Return an unsaved Region instance with valid geometry."""
    return Region(
        code="0001_0001",
        name="Test Region",
        boundary=GEOSGeometry(SAMPLE_POLYGON_WKT, srid=4326),
    )


@pytest.fixture
def sample_path(sample_region: Region) -> Path:
    """Return an unsaved Path instance with valid geometry."""
    return Path(
        region=sample_region,
        name="Test Street",
        geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326),
        category="street",
        surface="asphalt",
        accessible=True,
        is_lit=True,
        region_code="0001_0001",
    )


@pytest.fixture
def saved_region(sample_region: Region) -> Region:
    """Return a saved Region instance (requires DB access)."""
    sample_region.save()
    return sample_region


@pytest.fixture
def multipolygon() -> GEOSGeometry:
    """Return a sample MultiPolygon geometry."""
    return GEOSGeometry(SAMPLE_POLYGON_WKT, srid=4326)


@pytest.fixture
def multilinestring() -> GEOSGeometry:
    """Return a sample MultiLineString geometry."""
    return GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326)
