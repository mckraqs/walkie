"""Tests for the PathWalkLog model and walked-paths views."""

import pytest
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from rest_framework.test import APIClient

from paths.models import Path
from regions.models import Region
from users.models import FavoriteRegion, PathWalkAction, PathWalkLog

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((20.0 50.0, 21.0 50.0, 21.0 51.0, 20.0 51.0, 20.0 50.0)))"
)
SAMPLE_LINESTRING_WKT = "MULTILINESTRING((20.0 50.0, 21.0 51.0))"


@pytest.fixture
def region() -> Region:
    """Return a saved Region instance."""
    return Region.objects.create(
        code="0001_0001",
        name="Test Region",
        boundary=GEOSGeometry(SAMPLE_POLYGON_WKT, srid=4326),
        administrative_district_lvl_1="mazowieckie",
        administrative_district_lvl_2="Warszawa",
    )


@pytest.fixture
def other_region() -> Region:
    """Return a second saved Region instance."""
    return Region.objects.create(
        code="0002_0002",
        name="Other Region",
        boundary=GEOSGeometry(
            "MULTIPOLYGON(((22.0 52.0, 23.0 52.0, 23.0 53.0, 22.0 53.0, 22.0 52.0)))",
            srid=4326,
        ),
        administrative_district_lvl_1="malopolskie",
        administrative_district_lvl_2="Krakow",
    )


@pytest.fixture
def path(region: Region) -> Path:
    """Return a saved Path instance linked to the primary region."""
    return Path.objects.create(
        region=region,
        name="Test Path",
        geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326),
        category="street",
        surface="asphalt",
        accessible=True,
        is_lit=True,
    )


@pytest.fixture
def other_path(other_region: Region) -> Path:
    """Return a saved Path instance linked to other_region."""
    return Path.objects.create(
        region=other_region,
        name="Other Path",
        geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326),
        category="street",
        surface="asphalt",
        accessible=True,
        is_lit=True,
    )


@pytest.fixture
def favorite(user: User, region: Region) -> FavoriteRegion:
    """Return a FavoriteRegion linking the test user to the primary region."""
    return FavoriteRegion.objects.create(user=user, region=region)


@pytest.mark.django_db
class TestPathWalkLogModel:
    """Tests for the PathWalkLog model."""

    def test_create_walk_log(self, user: User, path: Path, region: Region) -> None:
        """PathWalkLog can be created with valid data and fields are correct."""
        log = PathWalkLog.objects.create(
            user=user,
            path=path,
            region=region,
            action=PathWalkAction.WALKED,
        )

        assert log.pk is not None
        assert log.user == user
        assert log.path == path
        assert log.region == region
        assert log.action == PathWalkAction.WALKED
        assert log.created_at is not None

    def test_cascade_delete_user(self, user: User, path: Path, region: Region) -> None:
        """Deleting the user deletes their walk logs."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )
        assert PathWalkLog.objects.filter(path=path).count() == 1

        user.delete()

        assert PathWalkLog.objects.filter(path=path).count() == 0

    def test_cascade_delete_path(self, user: User, path: Path, region: Region) -> None:
        """Deleting the path deletes related walk logs."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )
        assert PathWalkLog.objects.filter(user=user).count() == 1

        path.delete()

        assert PathWalkLog.objects.filter(user=user).count() == 0

    def test_cascade_delete_region(
        self, user: User, path: Path, region: Region
    ) -> None:
        """Deleting the region deletes related walk logs."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )
        assert PathWalkLog.objects.filter(user=user).count() == 1

        region.delete()

        assert PathWalkLog.objects.filter(user=user).count() == 0

    def test_multiple_logs_for_same_path(
        self, user: User, path: Path, region: Region
    ) -> None:
        """Multiple walk log entries can be created for the same path (audit log)."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.UNWALKED
        )
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )

        assert PathWalkLog.objects.filter(user=user, path=path).count() == 3


@pytest.mark.django_db
class TestWalkedPathsListView:
    """Tests for GET /api/regions/{region_id}/paths/walked/."""

    def test_returns_walked_path_ids(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """Returns correct IDs for paths currently marked as walked."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert path.pk in data["walked_path_ids"]

    def test_respects_unwalked_state(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """A path that was walked then unwalked is not in the response."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.UNWALKED
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert path.pk not in data["walked_path_ids"]

    def test_403_for_non_favorite_region(
        self, auth_client: APIClient, region: Region
    ) -> None:
        """Returns 403 when the region is not in the user's favorites."""
        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 403

    def test_401_unauthenticated(self, region: Region) -> None:
        """Returns 401 when the request is unauthenticated."""
        client = APIClient()
        response = client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 401

    def test_returns_total_paths_count(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """total_paths matches the count of all paths in the region."""
        second_path = Path.objects.create(
            region=region,
            name="Second Path",
            geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326),
            category="footway",
            surface="gravel",
            accessible=False,
            is_lit=False,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert data["total_paths"] == 2
        _ = second_path  # referenced to satisfy linter

    def test_empty_when_no_walks(
        self,
        auth_client: APIClient,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """Returns an empty walked_path_ids list when no walk logs exist."""
        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert data["walked_path_ids"] == []


@pytest.mark.django_db
class TestPathWalkToggleView:
    """Tests for POST /api/regions/{region_id}/paths/{path_id}/walk/."""

    def test_toggle_to_walked(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """First toggle marks the path as walked and returns the correct state."""
        response = auth_client.post(f"/api/regions/{region.pk}/paths/{path.pk}/walk/")

        assert response.status_code == 200
        data = response.json()
        assert data["path_id"] == path.pk
        assert data["action"] == PathWalkAction.WALKED
        assert path.pk in data["walked_path_ids"]

    def test_toggle_to_unwalked(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """Second toggle marks the path as unwalked."""
        PathWalkLog.objects.create(
            user=user, path=path, region=region, action=PathWalkAction.WALKED
        )

        response = auth_client.post(f"/api/regions/{region.pk}/paths/{path.pk}/walk/")

        assert response.status_code == 200
        data = response.json()
        assert data["action"] == PathWalkAction.UNWALKED
        assert path.pk not in data["walked_path_ids"]

    def test_returns_updated_walked_set(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """Response includes updated walked_path_ids and correct total_paths."""
        second_path = Path.objects.create(
            region=region,
            name="Second Path",
            geometry=GEOSGeometry(SAMPLE_LINESTRING_WKT, srid=4326),
            category="footway",
            surface="gravel",
            accessible=False,
            is_lit=False,
        )
        PathWalkLog.objects.create(
            user=user, path=second_path, region=region, action=PathWalkAction.WALKED
        )

        response = auth_client.post(f"/api/regions/{region.pk}/paths/{path.pk}/walk/")

        assert response.status_code == 200
        data = response.json()
        assert sorted(data["walked_path_ids"]) == sorted([path.pk, second_path.pk])
        assert data["total_paths"] == 2

    def test_403_non_favorite_region(
        self, auth_client: APIClient, region: Region, path: Path
    ) -> None:
        """Returns 403 when the region is not in the user's favorites."""
        response = auth_client.post(f"/api/regions/{region.pk}/paths/{path.pk}/walk/")

        assert response.status_code == 403

    def test_404_wrong_path_region(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        other_path: Path,
        favorite: FavoriteRegion,
    ) -> None:
        """Returns 404 when the path does not belong to the region."""
        response = auth_client.post(
            f"/api/regions/{region.pk}/paths/{other_path.pk}/walk/"
        )

        assert response.status_code == 404

    def test_404_nonexistent_path(
        self,
        auth_client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Returns 404 for a non-existent path ID."""
        response = auth_client.post(f"/api/regions/{region.pk}/paths/999999/walk/")

        assert response.status_code == 404

    def test_401_unauthenticated(self, region: Region, path: Path) -> None:
        """Returns 401 when the request is unauthenticated."""
        client = APIClient()
        response = client.post(f"/api/regions/{region.pk}/paths/{path.pk}/walk/")

        assert response.status_code == 401
