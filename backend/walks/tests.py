"""Tests for the walks app."""

from datetime import date

import pytest
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from rest_framework.test import APIClient

from paths.models import Path, PathSegment, Segment
from regions.models import Region
from routes.models import Route
from users.models import FavoriteRegion
from users.views import _get_walked_paths
from walks.models import Walk

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((19.99 49.99, 20.01 49.99, 20.01 50.01, 19.99 50.01, 19.99 49.99)))"
)


@pytest.fixture
def user(db: object) -> User:
    """Create a test user."""
    return User.objects.create_user(username="walker", password="testpass")


@pytest.fixture
def client(user: User) -> APIClient:
    """Create an authenticated API client."""
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def region(db: object) -> Region:
    """Create a test region with a boundary."""
    return Region.objects.create(
        code="TEST",
        name="Test Region",
        boundary=GEOSGeometry(SAMPLE_POLYGON_WKT, srid=4326),
        administrative_district_lvl_1="Test District",
        administrative_district_lvl_2="Test City",
    )


@pytest.fixture
def favorite(user: User, region: Region) -> FavoriteRegion:
    """Make the region a favorite for the user."""
    return FavoriteRegion.objects.create(user=user, region=region)


@pytest.fixture
def segments(region: Region) -> list[Segment]:
    """Create 3 connected segments."""
    wkts = [
        "LINESTRING(20.000 50.000, 20.001 50.000)",
        "LINESTRING(20.001 50.000, 20.002 50.000)",
        "LINESTRING(20.002 50.000, 20.003 50.000)",
    ]
    segs = []
    for i, wkt in enumerate(wkts):
        segs.append(
            Segment.objects.create(
                region=region,
                name=f"Segment {i}",
                geometry=GEOSGeometry(wkt, srid=4326),
                category="footway",
                surface="asphalt",
            )
        )
    return segs


@pytest.fixture
def route_with_segments(user: User, region: Region, segments: list[Segment]) -> Route:
    """Create a saved route with segment_ids."""
    return Route.objects.create(
        user=user,
        region=region,
        name="Test Route",
        segment_ids=[s.pk for s in segments],
        total_distance=300.0,
    )


@pytest.fixture
def drawn_route(user: User, region: Region) -> Route:
    """Create a drawn route with custom_geometry."""
    return Route.objects.create(
        user=user,
        region=region,
        name="Drawn Route",
        segment_ids=[],
        total_distance=200.0,
        is_custom=True,
        custom_geometry=GEOSGeometry(
            "LINESTRING(20.000 50.000, 20.001 50.000, 20.002 50.000)",
            srid=4326,
        ),
    )


def _make_walk(
    user: User,
    region: Region,
    segments: list[Segment] | None = None,
    name: str = "Walk",
    walked_at: date | None = None,
) -> Walk:
    """Create a walk for testing."""
    geom = GEOSGeometry(
        "LINESTRING(20.000 50.000, 20.001 50.000, 20.002 50.000)",
        srid=4326,
    )
    return Walk.objects.create(
        user=user,
        region=region,
        name=name,
        geometry=geom,
        segment_ids=[s.pk for s in segments] if segments else [],
        walked_at=walked_at or date(2026, 4, 1),
        distance=200.0,
    )


# --- 7.1: Walk model creation and ordering ---


@pytest.mark.django_db
class TestWalkModel:
    """Test Walk model creation and ordering."""

    def test_create_walk(self, user: User, region: Region) -> None:
        """Walk can be created with all fields."""
        walk = _make_walk(user, region)
        assert walk.pk is not None
        assert walk.name == "Walk"
        assert walk.walked_at == date(2026, 4, 1)

    def test_str(self, user: User, region: Region) -> None:
        """Walk __str__ includes name and date."""
        walk = _make_walk(user, region, name="Morning Walk")
        assert "Morning Walk" in str(walk)
        assert "2026-04-01" in str(walk)

    def test_ordering(self, user: User, region: Region) -> None:
        """Walks are ordered by walked_at desc, then created_at desc."""
        w1 = _make_walk(user, region, name="Older", walked_at=date(2026, 3, 1))
        w2 = _make_walk(user, region, name="Newer", walked_at=date(2026, 4, 1))
        walks = list(Walk.objects.filter(user=user, region=region))
        assert walks[0].pk == w2.pk
        assert walks[1].pk == w1.pk


# --- 7.2: WalkListCreateView ---


@pytest.mark.django_db
class TestWalkListCreateView:
    """Test the walk list and create endpoints."""

    def test_list_empty(
        self, client: APIClient, region: Region, favorite: FavoriteRegion
    ) -> None:
        """GET returns empty list when no walks."""
        resp = client.get(f"/api/regions/{region.pk}/walks/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_walks(
        self,
        client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """GET returns user's walks."""
        _make_walk(user, region, name="Walk 1")
        _make_walk(user, region, name="Walk 2")
        resp = client.get(f"/api/regions/{region.pk}/walks/")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_403_not_favorite(self, client: APIClient, region: Region) -> None:
        """GET returns 403 when region is not favorited."""
        resp = client.get(f"/api/regions/{region.pk}/walks/")
        assert resp.status_code == 403

    def test_create_from_route(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
        route_with_segments: Route,
    ) -> None:
        """POST with route_id creates a walk from route segments."""
        resp = client.post(
            f"/api/regions/{region.pk}/walks/",
            {
                "name": "My Walk",
                "walked_at": "2026-04-15",
                "route_id": route_with_segments.pk,
            },
            format="json",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My Walk"
        assert data["walked_at"] == "2026-04-15"
        assert "walked_path_ids" in data

    def test_create_from_drawn_route(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
        drawn_route: Route,
    ) -> None:
        """POST with route_id for a drawn route copies custom_geometry."""
        resp = client.post(
            f"/api/regions/{region.pk}/walks/",
            {
                "name": "Drawn Walk",
                "walked_at": "2026-04-15",
                "route_id": drawn_route.pk,
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_create_from_geometry(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """POST with geometry creates a walk."""
        resp = client.post(
            f"/api/regions/{region.pk}/walks/",
            {
                "name": "Drawn Walk",
                "walked_at": "2026-04-15",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [20.0, 50.0],
                        [20.001, 50.0],
                        [20.002, 50.0],
                    ],
                },
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_create_validation_both(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
        route_with_segments: Route,
    ) -> None:
        """POST with both route_id and geometry returns 400."""
        resp = client.post(
            f"/api/regions/{region.pk}/walks/",
            {
                "name": "Bad",
                "walked_at": "2026-04-15",
                "route_id": route_with_segments.pk,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[20.0, 50.0], [20.001, 50.0]],
                },
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_create_validation_neither(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """POST with neither route_id nor geometry returns 400."""
        resp = client.post(
            f"/api/regions/{region.pk}/walks/",
            {"name": "Bad", "walked_at": "2026-04-15"},
            format="json",
        )
        assert resp.status_code == 400

    def test_create_validation_missing_fields(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """POST without name returns 400."""
        resp = client.post(
            f"/api/regions/{region.pk}/walks/",
            {
                "walked_at": "2026-04-15",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[20.0, 50.0], [20.001, 50.0]],
                },
            },
            format="json",
        )
        assert resp.status_code == 400


# --- 7.3: WalkDetailView ---


@pytest.mark.django_db
class TestWalkDetailView:
    """Test the walk detail, rename, and delete endpoints."""

    def test_get_detail(
        self,
        client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """GET returns walk with geometry."""
        walk = _make_walk(user, region)
        resp = client.get(f"/api/regions/{region.pk}/walks/{walk.pk}/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == walk.pk
        assert data["geometry"]["type"] == "LineString"

    def test_rename(
        self,
        client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """PATCH renames the walk."""
        walk = _make_walk(user, region, name="Old Name")
        resp = client.patch(
            f"/api/regions/{region.pk}/walks/{walk.pk}/",
            {"name": "New Name"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_delete(
        self,
        client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """DELETE removes the walk."""
        walk = _make_walk(user, region)
        resp = client.delete(f"/api/regions/{region.pk}/walks/{walk.pk}/")
        assert resp.status_code == 204
        assert not Walk.objects.filter(pk=walk.pk).exists()

    def test_404_other_user(
        self,
        client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """GET returns 404 for walk belonging to another user."""
        other = User.objects.create_user(username="other", password="pass")
        walk = _make_walk(other, region)
        resp = client.get(f"/api/regions/{region.pk}/walks/{walk.pk}/")
        assert resp.status_code == 404


# --- 7.4: Walk progress ---


@pytest.mark.django_db
class TestWalkProgress:
    """Test that walk segment_ids feed into progress computation."""

    def test_progress_with_walks(
        self, user: User, region: Region, segments: list[Segment]
    ) -> None:
        """Walks covering segments produce correct progress."""
        path = Path.objects.create(
            region=region,
            name="Test Street",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.000, 20.003 50.000))",
                srid=4326,
            ),
            category="footway",
        )
        for seg in segments:
            PathSegment.objects.create(path=path, segment=seg)

        _make_walk(user, region, segments=segments)
        result = _get_walked_paths(user, region)
        assert path.pk in result.path_ids
        assert result.walked_count == 1

    def test_no_walks_empty_progress(
        self, user: User, region: Region, segments: list[Segment]
    ) -> None:
        """No walks means no progress."""
        path = Path.objects.create(
            region=region,
            name="Test Street",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.000, 20.003 50.000))",
                srid=4326,
            ),
            category="footway",
        )
        for seg in segments:
            PathSegment.objects.create(path=path, segment=seg)

        result = _get_walked_paths(user, region)
        assert result.path_ids == []
        assert result.walked_count == 0
