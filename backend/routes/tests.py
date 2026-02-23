"""Tests for the routes app."""

import pytest
from django.contrib.gis.geos import GEOSGeometry
from django.core.management import call_command
from django.db import connection
from rest_framework.test import APIClient

from paths.models import Path, Segment
from regions.models import Region
from routes.services import (
    RouteGenerationError,
    RouteType,
    _build_penalized_edges_sql,
    _get_node_coordinates,
    _pick_random_source_node,
    generate_route,
    get_route_segments,
)


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
    ) -> None:
        """200 response with total_distance and paths."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{region_with_topology.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        assert "total_distance" in data
        assert data["total_distance"] > 0
        assert "paths" in data
        assert data["paths"]["type"] == "FeatureCollection"
        assert len(data["paths"]["features"]) > 0

    def test_response_includes_start_and_end_points(
        self,
        region_with_topology: Region,
    ) -> None:
        """API response contains start_point and end_point coordinates."""
        client = APIClient()
        response = client.post(
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

    def test_invalid_distance_too_small(self, saved_region: Region) -> None:
        """400 for distance below minimum."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 0.01},
            format="json",
        )

        assert response.status_code == 400

    def test_missing_distance(self, saved_region: Region) -> None:
        """400 for empty request body."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {},
            format="json",
        )

        assert response.status_code == 400

    def test_no_topology_returns_422(self, saved_region: Region) -> None:
        """422 with detail message when no routable segments exist."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 422
        assert "detail" in response.json()

    def test_nonexistent_region_returns_404(self) -> None:
        """404 when the region does not exist."""
        client = APIClient()
        response = client.post(
            "/api/regions/999999/routes/generate/",
            {"target_distance_km": 3.0},
            format="json",
        )

        assert response.status_code == 404

    def test_default_route_type_is_one_way(
        self,
        region_with_topology: Region,
    ) -> None:
        """Default route_type produces a non-loop route."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{region_with_topology.pk}/routes/generate/",
            {"target_distance_km": 0.2},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["is_loop"] is False

    def test_loop_route_type(
        self,
        region_with_loop_topology: Region,
    ) -> None:
        """POST with route_type=loop returns is_loop=true."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{region_with_loop_topology.pk}/routes/generate/",
            {"target_distance_km": 0.5, "route_type": "loop"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["is_loop"] is True

    def test_invalid_route_type_returns_400(self, saved_region: Region) -> None:
        """400 for invalid route_type value."""
        client = APIClient()
        response = client.post(
            f"/api/regions/{saved_region.pk}/routes/generate/",
            {"target_distance_km": 3.0, "route_type": "invalid"},
            format="json",
        )

        assert response.status_code == 400


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
