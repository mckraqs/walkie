"""Tests for the users app."""

import pytest
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from django.db import IntegrityError
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from regions.models import Region
from users.models import FavoriteRegion

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((20.0 50.0, 21.0 50.0, 21.0 51.0, 20.0 51.0, 20.0 50.0)))"
)


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


@pytest.mark.django_db
class TestLoginView:
    """Tests for POST /api/auth/login/."""

    def test_valid_credentials_returns_token(self, user: User) -> None:
        """Valid credentials return a token and user data."""
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "testuser", "password": "testpassword123"},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["username"] == "testuser"
        assert data["user"]["id"] == user.pk

    def test_invalid_password_returns_400(self, user: User) -> None:
        """Wrong password returns 400."""
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "testuser", "password": "wrongpassword"},
            format="json",
        )

        assert response.status_code == 400
        assert "detail" in response.json()

    def test_nonexistent_user_returns_400(self) -> None:
        """Non-existent username returns 400."""
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "nobody", "password": "somepassword"},
            format="json",
        )

        assert response.status_code == 400

    def test_missing_fields_returns_400(self) -> None:
        """Missing username or password returns 400."""
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "testuser"},
            format="json",
        )

        assert response.status_code == 400


@pytest.mark.django_db
class TestLogoutView:
    """Tests for POST /api/auth/logout/."""

    def test_logout_deletes_token(self, auth_client: APIClient, user: User) -> None:
        """Logout deletes the token and returns 204."""
        assert Token.objects.filter(user=user).exists()

        response = auth_client.post("/api/auth/logout/")

        assert response.status_code == 204
        assert not Token.objects.filter(user=user).exists()

    def test_unauthenticated_logout_returns_401(self) -> None:
        """Unauthenticated logout returns 401."""
        client = APIClient()
        response = client.post("/api/auth/logout/")

        assert response.status_code == 401


@pytest.mark.django_db
class TestMeView:
    """Tests for GET /api/auth/me/."""

    def test_returns_current_user(self, auth_client: APIClient, user: User) -> None:
        """Returns the authenticated user's id and username."""
        response = auth_client.get("/api/auth/me/")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == user.pk
        assert data["username"] == "testuser"

    def test_unauthenticated_returns_401(self) -> None:
        """Unauthenticated request returns 401."""
        client = APIClient()
        response = client.get("/api/auth/me/")

        assert response.status_code == 401


@pytest.mark.django_db
class TestFavoriteRegionModel:
    """Tests for the FavoriteRegion model."""

    def test_create_favorite(self, user: User, region: Region) -> None:
        """FavoriteRegion can be created with user and region."""
        favorite = FavoriteRegion.objects.create(user=user, region=region)

        assert favorite.pk is not None
        assert favorite.user == user
        assert favorite.region == region
        assert favorite.created_at is not None

    def test_unique_constraint_prevents_duplicates(
        self, user: User, region: Region
    ) -> None:
        """Creating a duplicate FavoriteRegion raises IntegrityError."""
        FavoriteRegion.objects.create(user=user, region=region)

        with pytest.raises(IntegrityError):
            FavoriteRegion.objects.create(user=user, region=region)

    def test_cascade_delete_user(self, user: User, region: Region) -> None:
        """Deleting the user also deletes their favorites."""
        FavoriteRegion.objects.create(user=user, region=region)
        assert FavoriteRegion.objects.filter(region=region).count() == 1

        user.delete()

        assert FavoriteRegion.objects.filter(region=region).count() == 0

    def test_cascade_delete_region(self, user: User, region: Region) -> None:
        """Deleting the region also deletes related favorites."""
        FavoriteRegion.objects.create(user=user, region=region)
        assert FavoriteRegion.objects.filter(user=user).count() == 1

        region.delete()

        assert FavoriteRegion.objects.filter(user=user).count() == 0


@pytest.mark.django_db
class TestFavoriteRegionListView:
    """Tests for GET /api/regions/favorites/."""

    def test_returns_only_user_favorites(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        other_region: Region,
    ) -> None:
        """Only the user's favorited regions are returned."""
        FavoriteRegion.objects.create(user=user, region=region)

        response = auth_client.get("/api/regions/favorites/")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == region.pk
        assert data[0]["is_favorite"] is True

    def test_empty_favorites_returns_empty_list(self, auth_client: APIClient) -> None:
        """Returns an empty list when the user has no favorites."""
        response = auth_client.get("/api/regions/favorites/")

        assert response.status_code == 200
        assert response.json() == []

    def test_unauthenticated_returns_401(self) -> None:
        """Unauthenticated request returns 401."""
        client = APIClient()
        response = client.get("/api/regions/favorites/")

        assert response.status_code == 401


@pytest.mark.django_db
class TestFavoriteRegionToggleView:
    """Tests for POST/DELETE /api/regions/<id>/favorite/."""

    def test_add_favorite_returns_201(
        self, auth_client: APIClient, region: Region
    ) -> None:
        """POST returns 201 when region is added to favorites."""
        response = auth_client.post(f"/api/regions/{region.pk}/favorite/")

        assert response.status_code == 201
        assert response.json()["detail"] == "Region added to favorites."

    def test_add_duplicate_returns_409(
        self, auth_client: APIClient, user: User, region: Region
    ) -> None:
        """POST returns 409 when region is already a favorite."""
        FavoriteRegion.objects.create(user=user, region=region)

        response = auth_client.post(f"/api/regions/{region.pk}/favorite/")

        assert response.status_code == 409
        assert "already in favorites" in response.json()["detail"]

    def test_add_nonexistent_region_returns_404(self, auth_client: APIClient) -> None:
        """POST returns 404 for a non-existent region."""
        response = auth_client.post("/api/regions/999999/favorite/")

        assert response.status_code == 404

    def test_remove_favorite_returns_204(
        self, auth_client: APIClient, user: User, region: Region
    ) -> None:
        """DELETE returns 204 when region is removed from favorites."""
        FavoriteRegion.objects.create(user=user, region=region)

        response = auth_client.delete(f"/api/regions/{region.pk}/favorite/")

        assert response.status_code == 204
        assert not FavoriteRegion.objects.filter(user=user, region=region).exists()

    def test_remove_nonexistent_favorite_returns_404(
        self, auth_client: APIClient, region: Region
    ) -> None:
        """DELETE returns 404 when region is not in user's favorites."""
        response = auth_client.delete(f"/api/regions/{region.pk}/favorite/")

        assert response.status_code == 404

    def test_unauthenticated_returns_401(self, region: Region) -> None:
        """Unauthenticated request returns 401."""
        client = APIClient()
        response = client.post(f"/api/regions/{region.pk}/favorite/")

        assert response.status_code == 401


@pytest.mark.django_db
class TestRegionListIsFavorite:
    """Tests for is_favorite annotation on the region list endpoint."""

    def test_includes_is_favorite_true_for_favorites(
        self, auth_client: APIClient, user: User, region: Region
    ) -> None:
        """is_favorite is True for regions the user has favorited."""
        FavoriteRegion.objects.create(user=user, region=region)

        response = auth_client.get("/api/regions/")

        assert response.status_code == 200
        data = response.json()
        item = next(r for r in data if r["id"] == region.pk)
        assert item["is_favorite"] is True

    def test_includes_is_favorite_false_for_non_favorites(
        self, auth_client: APIClient, region: Region
    ) -> None:
        """is_favorite is False for regions the user has not favorited."""
        response = auth_client.get("/api/regions/")

        assert response.status_code == 200
        data = response.json()
        item = next(r for r in data if r["id"] == region.pk)
        assert item["is_favorite"] is False


@pytest.mark.django_db
class TestRouteGeneratePermission:
    """Tests for route generation restricted to favorite regions."""

    def test_favorite_region_allows_generation(
        self,
        auth_client: APIClient,
        user: User,
        saved_region: Region,
    ) -> None:
        """Route generation succeeds (not 403) when region is a favorite."""
        FavoriteRegion.objects.create(user=user, region=saved_region)

        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        # 422 because region has no topology, but NOT 403
        assert response.status_code != 403

    def test_non_favorite_region_returns_403(
        self,
        auth_client: APIClient,
        saved_region: Region,
    ) -> None:
        """Route generation returns 403 when region is not a favorite."""
        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 403
        assert "detail" in response.json()
