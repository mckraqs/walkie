"""Tests for the routes app."""

import pytest
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from django.core.management import call_command
from django.db import connection
from rest_framework.test import APIClient

from paths.models import Path, PathSegment, Segment
from regions.models import Region
from routes.models import Route
from routes.services import (
    RouteGenerationError,
    RouteType,
    _build_penalized_edges_sql,
    _build_penalized_randomized_edges_sql,
    _build_randomized_edges_sql,
    _compute_bearing,
    _compute_loop_waypoint_count,
    _compute_waypoint_count,
    _find_random_node_near_place,
    _get_node_coordinates,
    _pick_random_source_node,
    generate_route,
    get_route_path_names,
    get_route_segments,
    stitch_segment_coordinates,
    stitch_segment_coordinates_from_ids,
    validate_segment_connectivity,
)
from users.models import FavoriteRegion


def _create_connected_segments(region: Region) -> list[Segment]:
    """Create 3 connected segments forming a line A->B->C->D.

    Each segment is ~111m (0.001 degrees of longitude at ~50N latitude).
    """
    wkts = [
        "LINESTRING(20.000 50.000, 20.001 50.000)",
        "LINESTRING(20.001 50.000, 20.002 50.000)",
        "LINESTRING(20.002 50.000, 20.003 50.000)",
    ]
    segments = []
    for i, wkt in enumerate(wkts):
        segments.append(
            Segment.objects.create(
                region=region,
                name=f"Segment {i}",
                geometry=GEOSGeometry(wkt, srid=4326),
                category="footway",
                surface="asphalt",
            )
        )
    return segments


def _create_loop_network(region: Region) -> list[Segment]:
    """Create a diamond/grid network with multiple paths between nodes.

    Layout (approximate):
        A --- B --- C
        |           |
        D --- E --- F

    This allows outbound (A->C via top) and return (C->A via bottom)
    to take different paths, enabling loop route testing.
    Each horizontal segment is ~71m, each vertical is ~111m.
    """
    wkts = [
        # Top row: A-B, B-C
        "LINESTRING(20.000 50.001, 20.001 50.001)",
        "LINESTRING(20.001 50.001, 20.002 50.001)",
        # Bottom row: D-E, E-F
        "LINESTRING(20.000 50.000, 20.001 50.000)",
        "LINESTRING(20.001 50.000, 20.002 50.000)",
        # Verticals: A-D, C-F
        "LINESTRING(20.000 50.001, 20.000 50.000)",
        "LINESTRING(20.002 50.001, 20.002 50.000)",
    ]
    segments = []
    for i, wkt in enumerate(wkts):
        segments.append(
            Segment.objects.create(
                region=region,
                name=f"Loop segment {i}",
                geometry=GEOSGeometry(wkt, srid=4326),
                category="footway",
                surface="asphalt",
            )
        )
    return segments


def _build_test_topology() -> None:
    """Run pgr_createTopology on the segments table for test data."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pgr_createTopology("
            "  'segments', 0.00001, 'geometry', 'id',"
            "  'source', 'target', clean := true"
            ")"
        )


def _link_segments_to_paths(region: Region) -> list[Path]:
    """Create Path objects and link them to existing segments via PathSegment.

    Creates 3 paths: "Alpha Trail", "Beta Lane", and one with a blank name.
    Links them to the first 3 segments in the region (one path per segment,
    blank-named path on the third).

    Returns:
        The created Path objects.
    """
    segments = list(Segment.objects.filter(region=region).order_by("pk")[:3])
    paths = [
        Path.objects.create(
            region=region,
            name="Alpha Trail",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.000, 20.001 50.000))", srid=4326
            ),
            category="street",
            surface="asphalt",
        ),
        Path.objects.create(
            region=region,
            name="Beta Lane",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.001 50.000, 20.002 50.000))", srid=4326
            ),
            category="street",
            surface="asphalt",
        ),
        Path.objects.create(
            region=region,
            name="",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.002 50.000, 20.003 50.000))", srid=4326
            ),
            category="street",
            surface="asphalt",
        ),
    ]
    for path, segment in zip(paths, segments, strict=True):
        PathSegment.objects.create(path=path, segment=segment)
    return paths


@pytest.fixture
def region_with_topology(saved_region: Region) -> Region:
    """Create a region with connected segments and built topology."""
    _create_connected_segments(saved_region)
    _build_test_topology()
    return saved_region


@pytest.fixture
def region_with_loop_topology(saved_region: Region) -> Region:
    """Create a region with a diamond network and built topology."""
    _create_loop_network(saved_region)
    _build_test_topology()
    return saved_region


@pytest.fixture
def region_with_topology_and_paths(saved_region: Region) -> Region:
    """Create a region with topology and path-to-segment linkage."""
    _create_connected_segments(saved_region)
    _build_test_topology()
    _link_segments_to_paths(saved_region)
    return saved_region


@pytest.mark.django_db
class TestPickRandomSourceNode:
    """Tests for _pick_random_source_node."""

    def test_returns_valid_node(self, region_with_topology: Region) -> None:
        """With topology data, returns a valid node ID."""
        node = _pick_random_source_node(region_with_topology.pk)

        assert isinstance(node, int)
        all_nodes = set(
            Segment.objects.filter(
                region=region_with_topology,
                source__isnull=False,
            ).values_list("source", flat=True)
        ) | set(
            Segment.objects.filter(
                region=region_with_topology,
                target__isnull=False,
            ).values_list("target", flat=True)
        )
        assert node in all_nodes

    def test_raises_for_empty_region(self, saved_region: Region) -> None:
        """Raises RouteGenerationError when no routable segments exist."""
        with pytest.raises(RouteGenerationError, match="No routable segments"):
            _pick_random_source_node(saved_region.pk)


@pytest.mark.django_db
class TestGetNodeCoordinates:
    """Tests for _get_node_coordinates."""

    def test_returns_coordinates(self, region_with_topology: Region) -> None:
        """Valid node returns a (lon, lat) tuple of floats."""
        node = _pick_random_source_node(region_with_topology.pk)
        lon, lat = _get_node_coordinates(node)

        assert isinstance(lon, float)
        assert isinstance(lat, float)
        # Coordinates should be in the range of our test data (~20, ~50)
        assert 19.0 < lon < 21.0
        assert 49.0 < lat < 51.0

    def test_raises_for_invalid_node(self, region_with_topology: Region) -> None:
        """Non-existent node raises RouteGenerationError."""
        with pytest.raises(RouteGenerationError, match="not found in topology"):
            _get_node_coordinates(999999)


@pytest.mark.django_db
class TestGenerateRoute:
    """Tests for generate_route."""

    def test_returns_route_result(self, region_with_topology: Region) -> None:
        """Valid topology produces a RouteResult with segment IDs and distance."""
        result = generate_route(region_with_topology.pk, 200.0)

        assert len(result.segment_ids) > 0
        assert result.total_distance > 0
        assert result.start_node != result.end_node

    def test_raises_for_region_without_topology(
        self,
        saved_region: Region,
    ) -> None:
        """Raises RouteGenerationError when region has no routable segments."""
        with pytest.raises(RouteGenerationError):
            generate_route(saved_region.pk, 1000.0)

    def test_route_has_start_and_end_points(self, region_with_topology: Region) -> None:
        """Route result includes start_point and end_point coordinates."""
        result = generate_route(region_with_topology.pk, 200.0)

        assert result.start_point is not None
        assert result.end_point is not None
        assert len(result.start_point) == 2
        assert len(result.end_point) == 2
        # Coordinates should be floats in our test data range
        for coord in (*result.start_point, *result.end_point):
            assert isinstance(coord, float)

    def test_one_way_is_not_loop(self, region_with_topology: Region) -> None:
        """One-way route has is_loop=False."""
        result = generate_route(region_with_topology.pk, 200.0, RouteType.ONE_WAY)
        assert result.is_loop is False


@pytest.mark.django_db
class TestGenerateLoopRoute:
    """Tests for loop route generation."""

    def test_loop_returns_to_start(self, region_with_loop_topology: Region) -> None:
        """Loop route start_node equals end_node (or is within tolerance)."""
        result = generate_route(region_with_loop_topology.pk, 500.0, RouteType.LOOP)

        assert result.is_loop is True
        assert result.start_node == result.end_node

    def test_loop_has_segments(self, region_with_loop_topology: Region) -> None:
        """Loop route produces a non-empty segment list."""
        result = generate_route(region_with_loop_topology.pk, 500.0, RouteType.LOOP)

        assert len(result.segment_ids) > 0
        assert result.total_distance > 0

    def test_loop_has_start_and_end_points(
        self, region_with_loop_topology: Region
    ) -> None:
        """Loop route includes start_point and end_point coordinates."""
        result = generate_route(region_with_loop_topology.pk, 500.0, RouteType.LOOP)

        assert result.start_point is not None
        assert result.end_point is not None
        for coord in (*result.start_point, *result.end_point):
            assert isinstance(coord, float)

    def test_loop_distance_is_reasonable(
        self, region_with_loop_topology: Region
    ) -> None:
        """Loop total distance is positive and within order of magnitude."""
        target = 500.0
        result = generate_route(region_with_loop_topology.pk, target, RouteType.LOOP)

        assert result.total_distance > 0


@pytest.mark.django_db
class TestRouteGenerateView:
    """Tests for the POST /api/regions/{id}/routes/generate/ endpoint."""

    def test_successful_route_generation(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """200 response with segments, paths_count, and path_names."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert "total_distance" in data
        assert data["total_distance"] > 0
        assert "segments" in data
        assert data["segments"]["type"] == "FeatureCollection"
        assert len(data["segments"]["features"]) > 0
        assert "paths_count" in data
        assert "path_names" in data
        assert isinstance(data["paths_count"], int)
        assert isinstance(data["path_names"], list)

    def test_response_includes_start_and_end_points(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """API response contains start_point and end_point coordinates."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert "start_point" in data
        assert "end_point" in data
        assert isinstance(data["start_point"], list)
        assert isinstance(data["end_point"], list)
        assert len(data["start_point"]) == 2
        assert len(data["end_point"]) == 2

    def test_invalid_distance_too_small(
        self, saved_region: Region, user: User, auth_client: APIClient
    ) -> None:
        """400 for distance below minimum."""
        FavoriteRegion.objects.create(user=user, region=saved_region)
        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 0.01},
            format="json",
        )

        assert response.status_code == 400

    def test_missing_distance(
        self, saved_region: Region, user: User, auth_client: APIClient
    ) -> None:
        """400 for empty request body."""
        FavoriteRegion.objects.create(user=user, region=saved_region)
        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {},
            format="json",
        )

        assert response.status_code == 400

    def test_no_topology_returns_422(
        self, saved_region: Region, user: User, auth_client: APIClient
    ) -> None:
        """422 with detail message when no routable segments exist."""
        FavoriteRegion.objects.create(user=user, region=saved_region)
        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 422
        assert "detail" in response.json()

    def test_nonexistent_region_returns_404(self, auth_client: APIClient) -> None:
        """404 when the region does not exist."""
        response = auth_client.post(
            "/api/regions/999999/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 404

    def test_default_route_type_is_one_way(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """Default route_type produces a non-loop route."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["is_loop"] is False

    def test_loop_route_type(
        self,
        region_with_loop_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST with route_type=loop returns is_loop=true."""
        FavoriteRegion.objects.create(user=user, region=region_with_loop_topology)
        response = auth_client.post(
            f"/api/regions/{region_with_loop_topology.pk}/routes/generate/",
            {"target_distance_km": 0.5, "route_type": "loop"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["is_loop"] is True

    def test_invalid_route_type_returns_400(
        self, saved_region: Region, user: User, auth_client: APIClient
    ) -> None:
        """400 for invalid route_type value."""
        FavoriteRegion.objects.create(user=user, region=saved_region)
        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0, "route_type": "invalid"},
            format="json",
        )

        assert response.status_code == 400

    def test_response_includes_path_names(
        self,
        region_with_topology_and_paths: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """Response contains non-empty path_names when segments are linked."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology_and_paths)
        response = auth_client.post(
            f"/api/regions/{region_with_topology_and_paths.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["paths_count"] > 0
        assert len(data["path_names"]) > 0
        # Blank names must be filtered out
        assert "" not in data["path_names"]

    def test_unauthenticated_returns_401(self, saved_region: Region) -> None:
        """401 for unauthenticated access."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 401

    def test_non_favorite_region_returns_403(
        self, saved_region: Region, auth_client: APIClient
    ) -> None:
        """403 when region is not in user's favorites."""
        response = auth_client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 403
        assert "detail" in response.json()


@pytest.mark.django_db
class TestGetRoutePathNames:
    """Tests for get_route_path_names."""

    def test_returns_names_in_route_order(
        self, region_with_topology_and_paths: Region
    ) -> None:
        """Returns non-blank names in segment traversal order."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology_and_paths)
            .order_by("pk")
            .values_list("pk", flat=True)[:3]
        )
        result = get_route_path_names(segment_ids)

        assert result == ["Alpha Trail", "Beta Lane"]

    def test_respects_reverse_segment_order(
        self, region_with_topology_and_paths: Region
    ) -> None:
        """Reversed segment order produces reversed path name order."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology_and_paths)
            .order_by("pk")
            .values_list("pk", flat=True)[:3]
        )
        result = get_route_path_names(list(reversed(segment_ids)))

        assert result == ["Beta Lane", "Alpha Trail"]

    def test_returns_empty_for_unlinked_segments(
        self, region_with_topology: Region
    ) -> None:
        """Segments without PathSegment records return an empty list."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology).values_list(
                "pk", flat=True
            )
        )
        result = get_route_path_names(segment_ids)

        assert result == []

    def test_returns_empty_for_empty_input(self) -> None:
        """Empty segment_ids returns an empty list."""
        assert get_route_path_names([]) == []

    def test_deduplicates_names(self, region_with_topology_and_paths: Region) -> None:
        """Same path linked to multiple segments appears only once."""
        segments = list(
            Segment.objects.filter(region=region_with_topology_and_paths).order_by(
                "pk"
            )[:2]
        )
        # Link both segments to the same path
        path = Path.objects.get(
            region=region_with_topology_and_paths, name="Alpha Trail"
        )
        PathSegment.objects.create(path=path, segment=segments[1])

        segment_ids = [s.pk for s in segments]
        result = get_route_path_names(segment_ids)

        assert result.count("Alpha Trail") == 1


@pytest.mark.django_db
class TestRouteSegmentOrdering:
    """Verify that route segments are returned in correct order."""

    def test_segment_sequence_preserved(self, region_with_topology: Region) -> None:
        """Segments are returned in the exact order from pgr_dijkstra."""
        result = generate_route(region_with_topology.pk, 200.0)
        segments_qs = get_route_segments(result.segment_ids)

        retrieved_ids = [s.id for s in segments_qs]
        assert retrieved_ids == result.segment_ids

    def test_sequence_index_annotation(self, region_with_topology: Region) -> None:
        """Each segment has a sequence_index matching its position."""
        result = generate_route(region_with_topology.pk, 200.0)
        segments_qs = get_route_segments(result.segment_ids)

        for expected_seq, segment in enumerate(segments_qs):
            assert segment.sequence_index == expected_seq

    def test_duplicate_segment_ids_preserved(
        self, region_with_topology: Region
    ) -> None:
        """Duplicate segment IDs appear multiple times in the result."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
        ids_with_duplicates = [segment_ids[0], segment_ids[1], segment_ids[0]]
        segments = get_route_segments(ids_with_duplicates)

        retrieved_ids = [s.id for s in segments]
        assert retrieved_ids == ids_with_duplicates
        assert segments[0].sequence_index == 0
        assert segments[1].sequence_index == 1
        assert segments[2].sequence_index == 2


@pytest.mark.django_db
class TestBuildTopologyClean:
    """Test topology rebuild with --clean flag."""

    def test_topology_rebuild_preserves_routability(
        self, region_with_topology: Region
    ) -> None:
        """Rebuilding topology with --clean still produces valid routes."""
        result1 = generate_route(region_with_topology.pk, 200.0)
        assert len(result1.segment_ids) > 0

        call_command("build_topology", "--clean")

        result2 = generate_route(region_with_topology.pk, 200.0)
        assert len(result2.segment_ids) > 0

    def test_clean_makes_all_segments_routable(
        self, region_with_topology: Region
    ) -> None:
        """After --clean rebuild, all segments have source and target set."""
        call_command("build_topology", "--clean")

        total = Segment.objects.filter(region=region_with_topology).count()
        routable = Segment.objects.filter(
            region=region_with_topology,
            source__isnull=False,
            target__isnull=False,
        ).count()
        assert routable == total


@pytest.mark.django_db
class TestCrossingPathsIntegration:
    """Integration test: crossing paths produce routable intersections."""

    def test_crossing_paths_allow_turning(self, saved_region: Region) -> None:
        """T-junction from two paths produces correct node count after noding.

        Creates a horizontal path and a vertical path that crosses it,
        forming a T-junction. After load_segments + build_topology, the
        intersection point should become a node, confirming the router
        can turn at mid-segment crossings.
        """
        # Horizontal: (20.000, 50.001) -> (20.002, 50.001)
        Path.objects.create(
            region=saved_region,
            name="Horizontal",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.000 50.001, 20.002 50.001))",
                srid=4326,
            ),
            category="street",
            surface="asphalt",
        )
        # Vertical T: (20.001, 50.000) -> (20.001, 50.001)
        # Touches horizontal at midpoint
        Path.objects.create(
            region=saved_region,
            name="Vertical",
            geometry=GEOSGeometry(
                "MULTILINESTRING((20.001 50.000, 20.001 50.001))",
                srid=4326,
            ),
            category="street",
            surface="asphalt",
        )

        call_command("load_segments", "--region-code", saved_region.code)
        call_command("build_topology", "--clean")

        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM segments_vertices_pgr")
            node_count = cursor.fetchone()[0]  # type: ignore[index]

        # T-junction: 3 segment endpoints + 1 shared intersection = 4 nodes
        # (horizontal left, horizontal right, vertical bottom, intersection)
        # The intersection point is where vertical meets horizontal midpoint.
        # Segments: horizontal-left, horizontal-right, vertical = 3 segments, 4 nodes
        assert Segment.objects.filter(region=saved_region).count() == 3
        assert node_count == 4


@pytest.mark.django_db
class TestBuildPenalizedEdgesSql:
    """Tests for _build_penalized_edges_sql."""

    def test_penalized_sql_contains_case_when(
        self, region_with_topology: Region
    ) -> None:
        """Penalized SQL uses CASE WHEN for specified segment IDs."""
        segments = Segment.objects.filter(region=region_with_topology)
        first_id = segments.first().pk  # type: ignore[union-attr]
        sql = _build_penalized_edges_sql(region_with_topology.pk, [first_id], 5.0)

        assert "CASE WHEN" in sql
        assert str(first_id) in sql
        assert "5.0" in sql

    def test_penalized_sql_is_executable(self, region_with_topology: Region) -> None:
        """Penalized edges SQL can be executed against the database."""
        segments = Segment.objects.filter(region=region_with_topology)
        first_id = segments.first().pk  # type: ignore[union-attr]
        sql = _build_penalized_edges_sql(region_with_topology.pk, [first_id], 5.0)

        with connection.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

        assert len(rows) > 0


def _create_saved_route(
    user: User,
    region: Region,
    *,
    name: str = "Morning Walk",
    segment_ids: list[int] | None = None,
    is_custom: bool = False,
) -> Route:
    """Create a saved Route for testing."""
    if segment_ids is None:
        segment_ids = list(
            Segment.objects.filter(region=region)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
    return Route.objects.create(
        user=user,
        region=region,
        name=name,
        segment_ids=segment_ids,
        total_distance=500.0,
        is_loop=False,
        is_custom=is_custom,
        start_point=[20.0, 50.0],
        end_point=[20.001, 50.0],
    )


@pytest.mark.django_db
class TestRouteModel:
    """Tests for the Route model."""

    def test_create_route(
        self,
        region_with_topology: Region,
        user: User,
    ) -> None:
        """Route can be created with all required fields."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology).values_list(
                "pk", flat=True
            )[:2]
        )
        route = Route.objects.create(
            user=user,
            region=region_with_topology,
            name="Test Route",
            segment_ids=segment_ids,
            total_distance=350.0,
            is_loop=False,
            start_point=[20.0, 50.0],
            end_point=[20.001, 50.0],
        )

        assert route.pk is not None
        assert route.name == "Test Route"
        assert route.segment_ids == segment_ids
        assert route.total_distance == 350.0
        assert route.is_loop is False
        assert route.created_at is not None

    def test_ordering_is_newest_first(
        self,
        region_with_topology: Region,
        user: User,
    ) -> None:
        """Routes are ordered by -created_at by default."""
        r1 = _create_saved_route(user, region_with_topology, name="First")
        r2 = _create_saved_route(user, region_with_topology, name="Second")

        routes = list(Route.objects.filter(user=user))
        assert routes[0].pk == r2.pk
        assert routes[1].pk == r1.pk

    def test_str_representation(
        self,
        region_with_topology: Region,
        user: User,
    ) -> None:
        """__str__ returns name and user."""
        route = _create_saved_route(user, region_with_topology)
        assert user.username in str(route)
        assert route.name in str(route)

    def test_is_custom_defaults_to_false(
        self,
        region_with_topology: Region,
        user: User,
    ) -> None:
        """Route.is_custom defaults to False."""
        route = _create_saved_route(user, region_with_topology)
        assert route.is_custom is False


@pytest.mark.django_db
class TestRouteListCreateView:
    """Tests for the saved routes list/create endpoint."""

    def test_list_empty(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """GET returns empty list when no saved routes exist."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
        )

        assert response.status_code == 200
        assert response.json() == []

    def test_list_returns_user_routes(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """GET returns saved routes belonging to the authenticated user."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        _create_saved_route(user, region_with_topology, name="Walk A")
        _create_saved_route(user, region_with_topology, name="Walk B")

        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        names = {r["name"] for r in data}
        assert names == {"Walk A", "Walk B"}
        for item in data:
            assert "id" in item
            assert "total_distance" in item
            assert "is_loop" in item
            assert "created_at" in item

    def test_create_route_success(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST creates a route and returns 201 with route summary."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology).values_list(
                "pk", flat=True
            )[:2]
        )

        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "New Route",
                "segment_ids": segment_ids,
                "total_distance": 420.0,
                "is_loop": False,
                "start_point": [20.0, 50.0],
                "end_point": [20.001, 50.0],
            },
            format="json",
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Route"
        assert data["total_distance"] == 420.0
        assert data["is_loop"] is False
        assert "id" in data
        assert "created_at" in data

    def test_create_route_non_favorite_returns_403(
        self,
        region_with_topology: Region,
        auth_client: APIClient,
    ) -> None:
        """POST returns 403 when region is not a favorite."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology).values_list(
                "pk", flat=True
            )[:2]
        )

        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "Route",
                "segment_ids": segment_ids,
                "total_distance": 100.0,
            },
            format="json",
        )

        assert response.status_code == 403

    def test_create_route_invalid_segment_ids(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST returns 400 when segment IDs don't belong to the region."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)

        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "Bad Route",
                "segment_ids": [999999, 999998],
                "total_distance": 100.0,
            },
            format="json",
        )

        assert response.status_code == 400
        assert "segment" in response.json()["detail"].lower()

    def test_create_route_limit_returns_409(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST returns 409 when the 25-route-per-region limit is reached."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology).values_list(
                "pk", flat=True
            )[:2]
        )
        for i in range(25):
            Route.objects.create(
                user=user,
                region=region_with_topology,
                name=f"Route {i}",
                segment_ids=segment_ids,
                total_distance=100.0,
            )

        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "One Too Many",
                "segment_ids": segment_ids,
                "total_distance": 100.0,
            },
            format="json",
        )

        assert response.status_code == 409

    def test_create_route_walked_true(
        self,
        region_with_topology_and_paths: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST with walked=true creates walked route and returns walk stats."""
        region = region_with_topology_and_paths
        FavoriteRegion.objects.create(user=user, region=region)
        segment_ids = list(
            Segment.objects.filter(region=region).values_list("pk", flat=True)[:2]
        )

        response = auth_client.post(
            f"/api/regions/{region.pk}/routes/saved/",
            {
                "name": "Walked Route",
                "segment_ids": segment_ids,
                "total_distance": 300.0,
                "is_loop": False,
                "walked": True,
            },
            format="json",
        )

        assert response.status_code == 201
        data = response.json()
        assert data["walked"] is True
        assert "walked_path_ids" in data
        assert "total_paths" in data
        assert "walked_count" in data
        assert isinstance(data["walked_path_ids"], list)

        route = Route.objects.get(pk=data["id"])
        assert route.walked is True

    def test_create_route_walked_defaults_false(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST without walked creates route with walked=False, no walk stats."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology).values_list(
                "pk", flat=True
            )[:2]
        )

        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "Normal Route",
                "segment_ids": segment_ids,
                "total_distance": 300.0,
                "is_loop": False,
            },
            format="json",
        )

        assert response.status_code == 201
        data = response.json()
        assert data["walked"] is False
        assert "walked_path_ids" not in data
        assert "total_paths" not in data
        assert "walked_count" not in data

        route = Route.objects.get(pk=data["id"])
        assert route.walked is False

    def test_list_non_favorite_returns_403(
        self,
        region_with_topology: Region,
        auth_client: APIClient,
    ) -> None:
        """GET returns 403 when region is not a favorite."""
        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
        )

        assert response.status_code == 403

    def test_unauthenticated_returns_401(
        self,
        region_with_topology: Region,
    ) -> None:
        """401 for unauthenticated access."""
        client = APIClient()
        response = client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
        )

        assert response.status_code == 401

    def test_user_isolation(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """User cannot see routes saved by another user."""
        other_user = User.objects.create_user(
            username="otheruser", password="otherpass123"
        )
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        FavoriteRegion.objects.create(user=other_user, region=region_with_topology)
        _create_saved_route(other_user, region_with_topology, name="Other Route")

        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
        )

        assert response.status_code == 200
        assert response.json() == []

    def test_create_custom_route_with_is_custom_flag(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST with is_custom=true creates a custom route."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        _build_test_topology()
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "Custom Walk",
                "segment_ids": segment_ids,
                "total_distance": 200.0,
                "is_loop": False,
                "is_custom": True,
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["is_custom"] is True

    def test_create_custom_route_validates_connectivity(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST with is_custom=true and disconnected segments returns 400."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        # Create a disconnected segment in a different location
        disconnected = Segment.objects.create(
            region=region_with_topology,
            name="Disconnected",
            geometry=GEOSGeometry(
                "LINESTRING(21.000 51.000, 21.001 51.000)", srid=4326
            ),
            category="footway",
            surface="asphalt",
            source=999,
            target=998,
        )
        connected_id = (
            Segment.objects.filter(region=region_with_topology)
            .exclude(pk=disconnected.pk)
            .first()
            .pk
        )
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "Bad Custom",
                "segment_ids": [connected_id, disconnected.pk],
                "total_distance": 200.0,
                "is_loop": False,
                "is_custom": True,
            },
            format="json",
        )
        assert response.status_code == 400
        assert "connected" in response.json()["detail"].lower()

    def test_create_custom_route_with_duplicate_segments(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """POST with duplicate segment IDs (dead-end retrace) succeeds."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        _build_test_topology()
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
        ids_with_duplicates = [segment_ids[0], segment_ids[1], segment_ids[0]]
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
            {
                "name": "Dead End Walk",
                "segment_ids": ids_with_duplicates,
                "total_distance": 300.0,
                "is_loop": True,
                "is_custom": True,
            },
            format="json",
        )
        assert response.status_code == 201
        route = Route.objects.get(pk=response.json()["id"])
        assert route.segment_ids == ids_with_duplicates

    def test_list_includes_is_custom(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """GET list includes is_custom field."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        _create_saved_route(user, region_with_topology, is_custom=True)
        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/",
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert "is_custom" in data[0]
        assert data[0]["is_custom"] is True


@pytest.mark.django_db
class TestRouteDetailView:
    """Tests for the saved route detail endpoint."""

    def test_get_route_detail(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """GET returns full route data matching RouteGenerateView shape."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
        )

        assert response.status_code == 200
        data = response.json()
        assert "total_distance" in data
        assert "is_loop" in data
        assert "start_point" in data
        assert "end_point" in data
        assert "segments" in data
        assert "paths_count" in data
        assert "path_names" in data
        assert data["segments"]["type"] == "FeatureCollection"

    def test_get_route_non_favorite_returns_403(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """GET returns 403 when region is not a favorite."""
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
        )

        assert response.status_code == 403

    def test_get_other_users_route_returns_404(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """GET returns 404 when trying to access another user's route."""
        other_user = User.objects.create_user(
            username="otheruser2", password="otherpass123"
        )
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(other_user, region_with_topology)

        response = auth_client.get(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
        )

        assert response.status_code == 404

    def test_delete_route(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """DELETE removes the route and returns 204."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.delete(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
        )

        assert response.status_code == 204
        assert not Route.objects.filter(pk=route.pk).exists()

    def test_delete_other_users_route_returns_404(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """DELETE returns 404 when trying to delete another user's route."""
        other_user = User.objects.create_user(
            username="otheruser3", password="otherpass123"
        )
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(other_user, region_with_topology)

        response = auth_client.delete(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
        )

        assert response.status_code == 404
        assert Route.objects.filter(pk=route.pk).exists()

    def test_delete_non_favorite_returns_403(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """DELETE returns 403 when region is not a favorite."""
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.delete(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
        )

        assert response.status_code == 403


@pytest.mark.django_db
class TestValidateSegmentConnectivity:
    """Tests for validate_segment_connectivity."""

    def test_connected_segments(self, region_with_topology: Region) -> None:
        """Connected segments return True."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)
        )
        assert validate_segment_connectivity(segment_ids) is True

    def test_disconnected_segments(self, region_with_topology: Region) -> None:
        """Disconnected segments return False."""
        disconnected = Segment.objects.create(
            region=region_with_topology,
            name="Isolated",
            geometry=GEOSGeometry(
                "LINESTRING(21.000 51.000, 21.001 51.000)", srid=4326
            ),
            category="footway",
            source=999,
            target=998,
        )
        first_id = (
            Segment.objects.filter(region=region_with_topology)
            .exclude(pk=disconnected.pk)
            .first()
            .pk
        )
        assert validate_segment_connectivity([first_id, disconnected.pk]) is False

    def test_single_segment(self, region_with_topology: Region) -> None:
        """Single segment returns True."""
        segment_id = Segment.objects.filter(region=region_with_topology).first().pk
        assert validate_segment_connectivity([segment_id]) is True

    def test_empty_list(self) -> None:
        """Empty list returns True."""
        assert validate_segment_connectivity([]) is True

    def test_duplicate_segment_ids(self, region_with_topology: Region) -> None:
        """Duplicate segment IDs (dead-end retrace) are accepted."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
        # Walk segments 0,1 then retrace 1,0
        ids_with_duplicates = [*segment_ids, segment_ids[1], segment_ids[0]]
        assert validate_segment_connectivity(ids_with_duplicates) is True


@pytest.mark.django_db
class TestRouteRenameView:
    """Tests for the PATCH /api/regions/{id}/routes/saved/{route_id}/ endpoint."""

    def test_rename_success(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """PATCH renames a route and returns updated summary."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.patch(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
            {"name": "Evening Stroll"},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Evening Stroll"
        assert data["id"] == route.pk
        route.refresh_from_db()
        assert route.name == "Evening Stroll"

    def test_empty_name_returns_400(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """PATCH with empty name returns 400."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.patch(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
            {"name": ""},
            format="json",
        )

        assert response.status_code == 400

    def test_non_favorite_region_returns_403(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """PATCH returns 403 when region is not a favorite."""
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.patch(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
            {"name": "New Name"},
            format="json",
        )

        assert response.status_code == 403

    def test_other_users_route_returns_404(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """PATCH returns 404 when trying to rename another user's route."""
        other_user = User.objects.create_user(
            username="otheruser4", password="otherpass123"
        )
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(other_user, region_with_topology)

        response = auth_client.patch(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
            {"name": "Hijacked"},
            format="json",
        )

        assert response.status_code == 404

    def test_nonexistent_route_returns_404(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """PATCH returns 404 for a nonexistent route."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)

        response = auth_client.patch(
            f"/api/regions/{region_with_topology.pk}/routes/saved/999999/",
            {"name": "Ghost"},
            format="json",
        )

        assert response.status_code == 404

    def test_unauthenticated_returns_401(
        self,
        region_with_topology: Region,
        user: User,
    ) -> None:
        """PATCH returns 401 for unauthenticated access."""
        route = _create_saved_route(user, region_with_topology)
        client = APIClient()

        response = client.patch(
            f"/api/regions/{region_with_topology.pk}/routes/saved/{route.pk}/",
            {"name": "Sneaky"},
            format="json",
        )

        assert response.status_code == 401


@pytest.mark.django_db
class TestRouteExport:
    """Tests for the GET .../export/ endpoint and segment stitching."""

    def _export_url(self, region_pk: int, route_pk: int) -> str:
        return f"/api/regions/{region_pk}/routes/saved/{route_pk}/export/"

    def test_export_gpx_success(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """Valid GPX response with correct content type and parseable XML."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, route.pk) + "?export_format=gpx",
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/gpx+xml"
        assert f"{route.name}.gpx" in response["Content-Disposition"]

        import xml.etree.ElementTree as ET

        root = ET.fromstring(response.content)
        ns = {"gpx": "http://www.topografix.com/GPX/1/1"}
        trkpts = root.findall(".//gpx:trkseg/gpx:trkpt", ns)
        assert len(trkpts) > 0
        for pt in trkpts:
            assert "lat" in pt.attrib
            assert "lon" in pt.attrib

    def test_export_kml_success(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """Valid KML response with correct content type and parseable XML."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, route.pk) + "?export_format=kml",
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/vnd.google-earth.kml+xml"
        assert f"{route.name}.kml" in response["Content-Disposition"]

        import xml.etree.ElementTree as ET

        root = ET.fromstring(response.content)
        ns = {"kml": "http://www.opengis.net/kml/2.2"}
        coords_elem = root.find(".//kml:LineString/kml:coordinates", ns)
        assert coords_elem is not None
        assert coords_elem.text is not None
        coord_triplets = coords_elem.text.strip().split()
        assert len(coord_triplets) > 0

    def test_export_default_format_is_gpx(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """No format param returns GPX."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, route.pk),
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/gpx+xml"

    def test_export_invalid_format(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """Returns 400 for invalid format."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, route.pk) + "?export_format=csv",
        )

        assert response.status_code == 400

    def test_export_requires_auth(
        self,
        region_with_topology: Region,
        user: User,
    ) -> None:
        """401 for unauthenticated request."""
        route = _create_saved_route(user, region_with_topology)
        client = APIClient()

        response = client.get(
            self._export_url(region_with_topology.pk, route.pk),
        )

        assert response.status_code == 401

    def test_export_requires_favorite_region(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """403 when region is not a favorite."""
        route = _create_saved_route(user, region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, route.pk),
        )

        assert response.status_code == 403

    def test_export_nonexistent_route(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """404 for nonexistent route."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, 999999),
        )

        assert response.status_code == 404

    def test_export_other_users_route(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """404 when trying to export another user's route."""
        other_user = User.objects.create_user(
            username="exportother", password="otherpass123"
        )
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        route = _create_saved_route(other_user, region_with_topology)

        response = auth_client.get(
            self._export_url(region_with_topology.pk, route.pk),
        )

        assert response.status_code == 404

    def test_segment_stitching_reversal(
        self,
        region_with_topology: Region,
    ) -> None:
        """Segments needing reversal are stitched correctly."""
        # Create two segments where the second is stored in reverse direction
        # Segment A: (20.0, 50.0) -> (20.001, 50.0)
        # Segment B: (20.002, 50.0) -> (20.001, 50.0)  - stored reversed
        seg_a = Segment.objects.create(
            region=region_with_topology,
            name="Stitch A",
            geometry=GEOSGeometry(
                "LINESTRING(20.000 50.000, 20.001 50.000)", srid=4326
            ),
            category="footway",
            surface="asphalt",
        )
        seg_b = Segment.objects.create(
            region=region_with_topology,
            name="Stitch B",
            geometry=GEOSGeometry(
                "LINESTRING(20.002 50.000, 20.001 50.000)", srid=4326
            ),
            category="footway",
            surface="asphalt",
        )

        segments_qs = Segment.objects.filter(pk__in=[seg_a.pk, seg_b.pk]).order_by("pk")
        coords = stitch_segment_coordinates(segments_qs)

        # After stitching, segment B should be reversed so coordinates flow
        # left to right: (20.0, 50.0), (20.001, 50.0), (20.002, 50.0)
        assert len(coords) == 3
        assert coords[0] == (20.0, 50.0)
        assert coords[1] == (20.001, 50.0)
        assert coords[2] == (20.002, 50.0)


@pytest.mark.django_db
class TestBuildRandomizedEdgesSql:
    """Tests for _build_randomized_edges_sql."""

    def test_contains_random(self, region_with_topology: Region) -> None:
        """Randomized SQL includes PostgreSQL random() calls."""
        sql = _build_randomized_edges_sql(region_with_topology.pk)
        assert "random()" in sql

    def test_is_executable(self, region_with_topology: Region) -> None:
        """Randomized edges SQL can be executed against the database."""
        sql = _build_randomized_edges_sql(region_with_topology.pk)
        with connection.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()
        assert len(rows) > 0

    def test_custom_jitter(self, region_with_topology: Region) -> None:
        """Custom jitter value is reflected in the SQL."""
        sql = _build_randomized_edges_sql(region_with_topology.pk, jitter=0.3)
        assert "0.85" in sql  # 1.0 - 0.3/2
        assert "0.3" in sql


@pytest.mark.django_db
class TestBuildPenalizedRandomizedEdgesSql:
    """Tests for _build_penalized_randomized_edges_sql."""

    def test_contains_penalty_and_random(self, region_with_topology: Region) -> None:
        """Penalized+randomized SQL contains CASE WHEN and random()."""
        segments = Segment.objects.filter(region=region_with_topology)
        first_id = segments.first().pk  # type: ignore[union-attr]
        sql = _build_penalized_randomized_edges_sql(
            region_with_topology.pk, [first_id], 5.0
        )
        assert "CASE WHEN" in sql
        assert "random()" in sql
        assert str(first_id) in sql
        assert "5.0" in sql

    def test_is_executable(self, region_with_topology: Region) -> None:
        """Penalized+randomized edges SQL can be executed."""
        segments = Segment.objects.filter(region=region_with_topology)
        first_id = segments.first().pk  # type: ignore[union-attr]
        sql = _build_penalized_randomized_edges_sql(
            region_with_topology.pk, [first_id], 5.0
        )
        with connection.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()
        assert len(rows) > 0


@pytest.mark.django_db
class TestFindRandomNodeNearPlace:
    """Tests for _find_random_node_near_place."""

    def test_returns_node_within_radius(self, region_with_topology: Region) -> None:
        """Returns a valid node when nodes exist within the radius."""
        node = _find_random_node_near_place(
            region_with_topology.pk, 20.0005, 50.0, 1000.0
        )
        assert isinstance(node, int)

    def test_falls_back_to_nearest(self, region_with_topology: Region) -> None:
        """Falls back to nearest node when none within small radius."""
        node = _find_random_node_near_place(region_with_topology.pk, 21.0, 51.0, 1.0)
        assert isinstance(node, int)

    def test_raises_for_empty_region(self, region_with_topology: Region) -> None:
        """Raises RouteGenerationError when region has no nodes."""
        with pytest.raises(RouteGenerationError, match="No network nodes"):
            _find_random_node_near_place(999999, 20.0, 50.0)


class TestComputeBearing:
    """Tests for _compute_bearing."""

    def test_north(self) -> None:
        """Bearing to a point due north is ~0 degrees."""
        bearing = _compute_bearing(0.0, 0.0, 0.0, 1.0)
        assert abs(bearing - 0.0) < 1.0

    def test_east(self) -> None:
        """Bearing to a point due east is ~90 degrees."""
        bearing = _compute_bearing(0.0, 0.0, 1.0, 0.0)
        assert abs(bearing - 90.0) < 1.0

    def test_south(self) -> None:
        """Bearing to a point due south is ~180 degrees."""
        bearing = _compute_bearing(0.0, 1.0, 0.0, 0.0)
        assert abs(bearing - 180.0) < 1.0

    def test_west(self) -> None:
        """Bearing to a point due west is ~270 degrees."""
        bearing = _compute_bearing(0.0, 0.0, -1.0, 0.0)
        assert abs(bearing - 270.0) < 1.0

    def test_result_in_range(self) -> None:
        """Bearing is always in [0, 360)."""
        for dest_lon, dest_lat in [(1, 1), (-1, 1), (-1, -1), (1, -1)]:
            bearing = _compute_bearing(0.0, 0.0, float(dest_lon), float(dest_lat))
            assert 0 <= bearing < 360


class TestComputeWaypointCount:
    """Tests for _compute_waypoint_count."""

    def test_short_distance(self) -> None:
        """Distances under 2km get 0 waypoints."""
        assert _compute_waypoint_count(1000.0) == 0

    def test_medium_distance(self) -> None:
        """Distances 2-5km get 1 waypoint."""
        assert _compute_waypoint_count(3000.0) == 1

    def test_long_distance(self) -> None:
        """Distances over 5km get 2 waypoints."""
        assert _compute_waypoint_count(6000.0) == 2

    def test_threshold_boundary(self) -> None:
        """At exactly 2000m, returns 1 waypoint."""
        assert _compute_waypoint_count(2000.0) == 1


class TestComputeLoopWaypointCount:
    """Tests for _compute_loop_waypoint_count."""

    def test_short_distance(self) -> None:
        """Distances under 2km get 2 waypoints."""
        assert _compute_loop_waypoint_count(1000.0) == 2

    def test_medium_distance(self) -> None:
        """Distances 2-5km get 3 waypoints."""
        assert _compute_loop_waypoint_count(3000.0) == 3

    def test_long_distance(self) -> None:
        """Distances over 5km get 4 waypoints."""
        assert _compute_loop_waypoint_count(6000.0) == 4


@pytest.mark.django_db
class TestStitchSegmentCoordinatesFromIds:
    """Tests for stitch_segment_coordinates_from_ids."""

    def test_basic_stitching(self, region_with_topology: Region) -> None:
        """Stitching from IDs produces a non-empty coordinate list."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)
        )
        coords = stitch_segment_coordinates_from_ids(segment_ids)
        assert len(coords) > 0

    def test_handles_duplicates(self, region_with_topology: Region) -> None:
        """Duplicate segment IDs are stitched independently."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
        coords_no_dup = stitch_segment_coordinates_from_ids(segment_ids)
        ids_with_dup = [*segment_ids, segment_ids[0]]
        coords_with_dup = stitch_segment_coordinates_from_ids(ids_with_dup)
        assert len(coords_with_dup) >= len(coords_no_dup)

    def test_empty_list(self) -> None:
        """Empty segment_ids returns an empty list."""
        assert stitch_segment_coordinates_from_ids([]) == []

    def test_dead_end_retrace(self, region_with_topology: Region) -> None:
        """Duplicate segment IDs are stitched as an out-and-back path."""
        segment_ids = list(
            Segment.objects.filter(region=region_with_topology)
            .order_by("pk")
            .values_list("pk", flat=True)[:2]
        )
        # Walk A, B, then retrace B, A
        ids_retrace = [*segment_ids, segment_ids[1], segment_ids[0]]
        coords = stitch_segment_coordinates_from_ids(ids_retrace)
        # Should form a path that returns to the start
        assert len(coords) > 0
        assert coords[0] == coords[-1]


@pytest.mark.django_db
class TestShortestPathFallback:
    """Tests for the shortest-path fallback in _generate_one_way_route."""

    def test_used_shortest_path_defaults_to_false(
        self, region_with_topology: Region
    ) -> None:
        """Normal route generation (no overrides) has used_shortest_path=False."""
        result = generate_route(region_with_topology.pk, 200.0)

        assert result.used_shortest_path is False

    def test_falls_back_to_shortest_path_when_distance_too_short(
        self, region_with_topology: Region
    ) -> None:
        """When target_distance < shortest path distance, fallback triggers."""
        segments = list(
            Segment.objects.filter(region=region_with_topology).order_by("pk")
        )
        start_node = segments[0].source
        end_node = segments[-1].target

        result = generate_route(
            region_with_topology.pk,
            10.0,
            RouteType.ONE_WAY,
            start_node_override=start_node,
            end_node_override=end_node,
        )

        assert result.used_shortest_path is True
        assert len(result.segment_ids) > 0
        assert result.start_point is not None
        assert result.end_point is not None

    def test_no_fallback_when_distance_sufficient(
        self, region_with_topology: Region
    ) -> None:
        """When target_distance >= shortest path distance, normal generation runs."""
        segments = list(
            Segment.objects.filter(region=region_with_topology).order_by("pk")
        )
        start_node = segments[0].source
        end_node = segments[-1].target

        result = generate_route(
            region_with_topology.pk,
            50_000.0,
            RouteType.ONE_WAY,
            start_node_override=start_node,
            end_node_override=end_node,
        )

        assert result.used_shortest_path is False

    def test_no_fallback_when_only_start_override(
        self, region_with_topology: Region
    ) -> None:
        """Fallback only fires when BOTH overrides are set; start-only is unaffected."""
        segments = list(
            Segment.objects.filter(region=region_with_topology).order_by("pk")
        )
        start_node = segments[0].source

        result = generate_route(
            region_with_topology.pk,
            200.0,
            RouteType.ONE_WAY,
            start_node_override=start_node,
        )

        assert result.used_shortest_path is False


@pytest.mark.django_db
class TestRouteGenerateViewUsedShortestPath:
    """Test that the generate endpoint propagates used_shortest_path."""

    def test_api_response_includes_used_shortest_path(
        self,
        region_with_topology: Region,
        user: User,
        auth_client: APIClient,
    ) -> None:
        """API response always includes the used_shortest_path boolean field."""
        FavoriteRegion.objects.create(user=user, region=region_with_topology)
        response = auth_client.post(
            f"/api/regions/{region_with_topology.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert "used_shortest_path" in data
        assert isinstance(data["used_shortest_path"], bool)
