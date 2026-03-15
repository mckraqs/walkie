"""Tests for the walked-paths segment-coverage formula and views."""

import pytest
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from rest_framework.test import APIClient

from paths.models import Path, PathSegment, Segment
from regions.models import Region
from routes.models import Route
from users.models import FavoriteRegion

SAMPLE_POLYGON_WKT = (
    "MULTIPOLYGON(((20.0 50.0, 21.0 50.0, 21.0 51.0, 20.0 51.0, 20.0 50.0)))"
)


def _line(coords: list[tuple[float, float]]) -> GEOSGeometry:
    """Build a LineString geometry from coordinate pairs."""
    wkt = "LINESTRING(" + ", ".join(f"{x} {y}" for x, y in coords) + ")"
    return GEOSGeometry(wkt, srid=4326)


def _multiline(coords: list[tuple[float, float]]) -> GEOSGeometry:
    """Build a MultiLineString geometry from coordinate pairs."""
    wkt = "MULTILINESTRING((" + ", ".join(f"{x} {y}" for x, y in coords) + "))"
    return GEOSGeometry(wkt, srid=4326)


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
def favorite(user: User, region: Region) -> FavoriteRegion:
    """Return a FavoriteRegion linking the test user to the primary region."""
    return FavoriteRegion.objects.create(user=user, region=region)


def _create_path_with_segments(
    region: Region,
    name: str,
    segment_coords: list[list[tuple[float, float]]],
) -> tuple[Path, list[Segment]]:
    """Create a Path with associated Segments and PathSegment join records.

    Each entry in segment_coords produces one Segment linked to the Path.
    The path geometry is a MultiLineString from the first segment's coords.
    """
    path = Path.objects.create(
        region=region,
        name=name,
        geometry=_multiline(segment_coords[0]),
        category="street",
        surface="asphalt",
        accessible=True,
        is_lit=True,
    )
    segments = []
    for coords in segment_coords:
        seg = Segment.objects.create(
            region=region,
            geometry=_line(coords),
            category="street",
            surface="asphalt",
        )
        PathSegment.objects.create(path=path, segment=seg)
        segments.append(seg)
    return path, segments


@pytest.mark.django_db
class TestGetWalkedPathIds:
    """Tests for the segment-coverage walked-paths formula."""

    def test_no_walked_routes_returns_empty(
        self,
        auth_client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """No walked routes means no walked paths."""
        _create_path_with_segments(region, "Path A", [[(20.0, 50.0), (20.5, 50.5)]])

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        assert response.json()["walked_path_ids"] == []
        assert response.json()["partially_walked_path_ids"] == []

    def test_route_covers_all_segments(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """A walked route covering all segments of a path marks it as walked."""
        path, segments = _create_path_with_segments(
            region,
            "Path A",
            [[(20.0, 50.0), (20.5, 50.5)], [(20.5, 50.5), (21.0, 51.0)]],
        )
        Route.objects.create(
            user=user,
            region=region,
            name="Route 1",
            segment_ids=[s.pk for s in segments],
            total_distance=1000,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        assert path.pk in response.json()["walked_path_ids"]
        assert path.pk in response.json()["partially_walked_path_ids"]

    def test_route_covers_at_least_half(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """A path with 2 equal segments is walked when 1 segment is covered."""
        # Two segments of roughly equal length
        path, segments = _create_path_with_segments(
            region,
            "Path A",
            [[(20.0, 50.0), (20.5, 50.5)], [(20.5, 50.5), (21.0, 51.0)]],
        )
        # Route covers only the first segment (50% of path)
        Route.objects.create(
            user=user,
            region=region,
            name="Route 1",
            segment_ids=[segments[0].pk],
            total_distance=500,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        assert path.pk in response.json()["walked_path_ids"]

    def test_route_covers_less_than_half(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """A path is NOT walked when coverage is below 50%."""
        # One short segment and two longer ones
        path, segments = _create_path_with_segments(
            region,
            "Path A",
            [
                [(20.0, 50.0), (20.1, 50.1)],
                [(20.1, 50.1), (20.5, 50.5)],
                [(20.5, 50.5), (21.0, 51.0)],
            ],
        )
        # Route covers only the short first segment (well below 50%)
        Route.objects.create(
            user=user,
            region=region,
            name="Route 1",
            segment_ids=[segments[0].pk],
            total_distance=100,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert path.pk not in data["walked_path_ids"]
        # Below 50% threshold but has some walked coverage
        assert path.pk in data["partially_walked_path_ids"]

    def test_multiple_routes_aggregate_segments(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Segments from multiple walked routes are aggregated with dedup."""
        path, segments = _create_path_with_segments(
            region,
            "Path A",
            [
                [(20.0, 50.0), (20.3, 50.3)],
                [(20.3, 50.3), (20.6, 50.6)],
                [(20.6, 50.6), (21.0, 51.0)],
            ],
        )
        # Route 1 covers segment 0
        Route.objects.create(
            user=user,
            region=region,
            name="Route 1",
            segment_ids=[segments[0].pk],
            total_distance=300,
            walked=True,
        )
        # Route 2 covers segments 0 and 1 (segment 0 is duplicated)
        Route.objects.create(
            user=user,
            region=region,
            name="Route 2",
            segment_ids=[segments[0].pk, segments[1].pk],
            total_distance=600,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        # Coverage: segments 0 + 1 out of 3 - roughly 2/3 >= 50%
        assert response.status_code == 200
        assert path.pk in response.json()["walked_path_ids"]

    def test_unwalked_routes_dont_contribute(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Only routes with walked=True contribute to coverage."""
        path, segments = _create_path_with_segments(
            region,
            "Path A",
            [[(20.0, 50.0), (21.0, 51.0)]],
        )
        Route.objects.create(
            user=user,
            region=region,
            name="Route 1",
            segment_ids=[s.pk for s in segments],
            total_distance=1000,
            walked=False,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        assert path.pk not in response.json()["walked_path_ids"]

    def test_cross_region_isolation(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        other_region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Walked routes in another region don't affect this region's paths."""
        path, _segments = _create_path_with_segments(
            region,
            "Path A",
            [[(20.0, 50.0), (21.0, 51.0)]],
        )
        other_path, other_segments = _create_path_with_segments(
            other_region,
            "Other Path",
            [[(22.0, 52.0), (23.0, 53.0)]],
        )
        # Walk the other region's segments - shouldn't affect primary region
        Route.objects.create(
            user=user,
            region=other_region,
            name="Other Route",
            segment_ids=[s.pk for s in other_segments],
            total_distance=1000,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        assert path.pk not in response.json()["walked_path_ids"]
        _ = other_path  # referenced to satisfy linter

    def test_sibling_paths_aggregate_by_name(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Two Path records with the same name are aggregated together.

        Walking >=50% of total segments across siblings marks both as walked.
        """
        path_a, segs_a = _create_path_with_segments(
            region,
            "Komunalna",
            [[(20.0, 50.0), (20.3, 50.3)]],
        )
        path_b, segs_b = _create_path_with_segments(
            region,
            "Komunalna",
            [[(20.3, 50.3), (20.6, 50.6)]],
        )
        # Walk all segments of path_a (50% of total "Komunalna" length)
        Route.objects.create(
            user=user,
            region=region,
            name="Walk",
            segment_ids=[s.pk for s in segs_a],
            total_distance=500,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        data = response.json()
        assert path_a.pk in data["walked_path_ids"]
        assert path_b.pk in data["walked_path_ids"]
        # Counter counts unique street names, not individual Path records
        assert data["walked_count"] == 1
        _ = segs_b  # referenced to satisfy linter

    def test_siblings_below_threshold(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Sibling paths below 50% aggregate coverage are not walked."""
        path_a, segs_a = _create_path_with_segments(
            region,
            "Komunalna",
            [[(20.0, 50.0), (20.1, 50.1)]],
        )
        path_b, _segs_b = _create_path_with_segments(
            region,
            "Komunalna",
            [[(20.1, 50.1), (20.5, 50.5)], [(20.5, 50.5), (21.0, 51.0)]],
        )
        # Walk only the short first sibling - well below 50% of total
        Route.objects.create(
            user=user,
            region=region,
            name="Walk",
            segment_ids=[s.pk for s in segs_a],
            total_distance=100,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        data = response.json()
        walked = data["walked_path_ids"]
        assert path_a.pk not in walked
        assert path_b.pk not in walked
        # path_a has walked coverage (its segment was walked)
        assert path_a.pk in data["partially_walked_path_ids"]
        # path_b has no walked segments
        assert path_b.pk not in data["partially_walked_path_ids"]

    def test_unnamed_paths_evaluated_individually(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """Unnamed paths are not grouped - each evaluated on its own."""
        path_a, segs_a = _create_path_with_segments(
            region,
            "",
            [[(20.0, 50.0), (20.5, 50.5)]],
        )
        path_b, _segs_b = _create_path_with_segments(
            region,
            "",
            [[(20.5, 50.5), (21.0, 51.0)]],
        )
        # Walk only path_a's segments
        Route.objects.create(
            user=user,
            region=region,
            name="Walk",
            segment_ids=[s.pk for s in segs_a],
            total_distance=500,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        walked = response.json()["walked_path_ids"]
        assert path_a.pk in walked
        assert path_b.pk not in walked

    def test_low_coverage_not_walked_many_segments(
        self,
        auth_client: APIClient,
        user: User,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """10 equal segments with only 1 walked (10%) must NOT be walked.

        Regression: a unit mismatch (meters vs degrees) between walked_length
        and total_length caused any touched path to pass the 50% threshold.
        """
        step = 0.07
        coords = [
            [(20.0 + i * step, 50.0), (20.0 + (i + 1) * step, 50.0)] for i in range(10)
        ]
        path, segments = _create_path_with_segments(region, "Long Street", coords)

        # Walk only the first segment - 10% coverage, well below 50%
        Route.objects.create(
            user=user,
            region=region,
            name="Short Walk",
            segment_ids=[segments[0].pk],
            total_distance=100,
            walked=True,
        )

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert path.pk not in data["walked_path_ids"]
        # Has some walked coverage despite being below 50% threshold
        assert path.pk in data["partially_walked_path_ids"]

    def test_total_paths_counts_unique_names(
        self,
        auth_client: APIClient,
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """total_paths counts unique street names, not individual records."""
        _create_path_with_segments(region, "Komunalna", [[(20.0, 50.0), (20.3, 50.3)]])
        _create_path_with_segments(region, "Komunalna", [[(20.3, 50.3), (20.6, 50.6)]])
        _create_path_with_segments(region, "Inna", [[(20.6, 50.6), (21.0, 51.0)]])

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        assert response.json()["total_paths"] == 2


@pytest.mark.django_db
class TestWalkedPathsListView:
    """Tests for GET /api/regions/{region_id}/paths/walked/ access control."""

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
        region: Region,
        favorite: FavoriteRegion,
    ) -> None:
        """total_paths matches the count of all paths in the region."""
        _create_path_with_segments(region, "Path A", [[(20.0, 50.0), (20.5, 50.5)]])
        _create_path_with_segments(region, "Path B", [[(20.5, 50.5), (21.0, 51.0)]])

        response = auth_client.get(f"/api/regions/{region.pk}/paths/walked/")

        assert response.status_code == 200
        data = response.json()
        assert data["total_paths"] == 2
        assert "partially_walked_path_ids" in data
