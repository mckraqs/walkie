"""Shared test fixtures for the backend Django apps."""

import pytest
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from paths.models import Path, Segment
from regions.models import Region

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((20.0 50.0, 21.0 50.0, 21.0 51.0, 20.0 51.0, 20.0 50.0)))"
)
SAMPLE_LINESTRING_WKT = "MULTILINESTRING((20.0 50.0, 21.0 51.0))"
SAMPLE_LINESTRING_WKT_SIMPLE = "LINESTRING(20.0 50.0, 21.0 51.0)"


@pytest.fixture
def user() -> User:
    """Return a saved test user."""
    return User.objects.create_user(username="testuser", password="testpassword123")


@pytest.fixture
def auth_token(user: User) -> Token:
    """Return an auth token for the test user."""
    token, _ = Token.objects.get_or_create(user=user)
    return token


@pytest.fixture
def auth_client(auth_token: Token) -> APIClient:
    """Return an APIClient authenticated with the test user's token."""
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {auth_token.key}")
    return client


@pytest.fixture
def sample_region() -> Region:
    """Return an unsaved Region instance with valid geometry."""
    return Region(
        code="0001_0001",
        name="Test Region",
        boundary=GEOSGeometry(SAMPLE_POLYGON_WKT, srid=4326),
        administrative_district_lvl_1="mazowieckie",
        administrative_district_lvl_2="Warszawa",
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
    )


@pytest.fixture
def sample_segment(sample_region: Region) -> Segment:
    """Return an unsaved Segment instance with valid geometry."""
    return Segment(
        region=sample_region,
        name="Test Segment",
        geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT_SIMPLE, srid=4326),
        category="street",
        surface="asphalt",
        accessible=True,
        is_lit=True,
    )


@pytest.fixture
def saved_region(sample_region: Region) -> Region:
    """Return a saved Region instance (requires DB access)."""
    sample_region.save()
    return sample_region


@pytest.fixture
def saved_segment(saved_region: Region) -> Segment:
    """Return a saved Segment instance (requires DB access)."""
    return Segment.objects.create(
        region=saved_region,
        name="Test Segment",
        geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT_SIMPLE, srid=4326),
        category="street",
        surface="asphalt",
        accessible=True,
        is_lit=True,
    )


@pytest.fixture
def multipolygon() -> GEOSGeometry:
    """Return a sample MultiPolygon geometry."""
    return GEOSGeometry(SAMPLE_POLYGON_WKT, srid=4326)


@pytest.fixture
def multilinestring() -> GEOSGeometry:
    """Return a sample MultiLineString geometry."""
    return GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326)
