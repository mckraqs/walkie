"""Route generation service using pgRouting."""

import logging
import random
from dataclasses import dataclass

from django.db import connection
from django.db.models import Case, IntegerField, QuerySet, When

from paths.models import Segment

logger = logging.getLogger(__name__)

WALKING_SPEED_MPS = 1.25  # 4.5 km/h in meters per second


class RouteGenerationError(Exception):
    """Raised when route generation fails."""


@dataclass(frozen=True)
class RouteResult:
    """Result of a route generation computation."""

    segment_ids: list[int]
    total_distance: float  # meters
    estimated_duration: float  # seconds
    start_node: int
    end_node: int


def generate_route(region_id: int, target_distance_m: float) -> RouteResult:
    """Generate a one-way route in a region targeting a specific distance.

    Args:
        region_id: The region to generate a route in.
        target_distance_m: Target route distance in meters.

    Returns:
        A RouteResult with ordered segment IDs and metadata.

    Raises:
        RouteGenerationError: If no routable segments exist or no suitable
            route is found.
    """
    logger.info(
        "Generating route: region_id=%d, target_distance_m=%.0f",
        region_id,
        target_distance_m,
    )
    source_node = _pick_random_source_node(region_id)
    target_node = _find_best_target_node(region_id, source_node, target_distance_m)
    result = _compute_shortest_path(region_id, source_node, target_node)
    logger.info(
        "Route generated: %d segments, %.0fm, nodes %d->%d",
        len(result.segment_ids),
        result.total_distance,
        result.start_node,
        result.end_node,
    )
    return result


def get_route_segments(segment_ids: list[int]) -> QuerySet[Segment]:
    """Fetch segments by IDs preserving the order from route generation.

    Args:
        segment_ids: Ordered list of segment IDs from RouteResult.

    Returns:
        QuerySet of Segment objects ordered by the input sequence.
    """
    ordering = Case(
        *[When(pk=pk, then=pos) for pos, pk in enumerate(segment_ids)],
        output_field=IntegerField(),
    )
    return (
        Segment.objects.filter(pk__in=segment_ids)
        .annotate(sequence_index=ordering)
        .order_by(ordering)
    )


def _build_edges_sql(region_id: int) -> str:
    """Build the edges SQL query for pgRouting functions.

    pgRouting functions (pgr_drivingDistance, pgr_dijkstra) require a raw SQL
    string for the edges query -- parameterized placeholders (%s) cannot be used
    inside it. The ``int()`` cast is a defensive measure to guarantee the value
    is safe for interpolation even if this function is called outside a
    URL-validated code path.

    Args:
        region_id: Region to filter segments by.

    Returns:
        SQL string for use as pgRouting edges query.
    """
    safe_id = int(region_id)
    return (
        f"SELECT id, source, target, "
        f"ST_Length(geometry::geography) AS cost, "
        f"ST_Length(geometry::geography) AS reverse_cost "
        f"FROM segments WHERE region_id = {safe_id} "
        f"AND source IS NOT NULL AND target IS NOT NULL"
    )


def _pick_random_source_node(region_id: int) -> int:
    """Pick a random node from the segment network in a region.

    Args:
        region_id: The region to pick a node from.

    Returns:
        A node ID.

    Raises:
        RouteGenerationError: If no routable segments exist in the region.
    """
    nodes = set(
        Segment.objects.filter(
            region_id=region_id,
            source__isnull=False,
            target__isnull=False,
        )
        .values_list("source", "target")
        .distinct()
    )
    flat_nodes = {n for pair in nodes for n in pair}
    if not flat_nodes:
        msg = f"No routable segments found in region {region_id}."
        raise RouteGenerationError(msg)
    return random.choice(list(flat_nodes))


def _find_best_target_node(
    region_id: int,
    source_node: int,
    target_distance_m: float,
) -> int:
    """Find the node closest to the target distance from source.

    Uses pgr_drivingDistance with 20% overshoot tolerance, then picks
    the node whose aggregate cost is closest to the target distance.

    Args:
        region_id: The region to route in.
        source_node: Starting node ID.
        target_distance_m: Desired route distance in meters.

    Returns:
        The best target node ID.

    Raises:
        RouteGenerationError: If no reachable nodes are found.
    """
    edges_sql = _build_edges_sql(region_id)
    max_cost = target_distance_m * 1.2

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT node, agg_cost FROM pgr_drivingDistance("
            "  %s, %s, %s, directed := false"
            ") WHERE node != %s "
            "ORDER BY ABS(agg_cost - %s) LIMIT 1",
            [edges_sql, source_node, max_cost, source_node, target_distance_m],
        )
        row = cursor.fetchone()

    if row is None:
        msg = (
            f"No reachable nodes found within {max_cost:.0f}m "
            f"from node {source_node} in region {region_id}."
        )
        raise RouteGenerationError(msg)

    return row[0]


def _compute_shortest_path(
    region_id: int,
    source_node: int,
    target_node: int,
) -> RouteResult:
    """Compute the shortest path between two nodes using Dijkstra.

    Args:
        region_id: The region to route in.
        source_node: Starting node ID.
        target_node: Ending node ID.

    Returns:
        A RouteResult with ordered edge IDs and total distance.

    Raises:
        RouteGenerationError: If no path exists between the nodes.
    """
    edges_sql = _build_edges_sql(region_id)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT edge, agg_cost FROM pgr_dijkstra("
            "  %s, %s, %s, directed := false"
            ") WHERE edge != -1 ORDER BY seq",
            [edges_sql, source_node, target_node],
        )
        rows = cursor.fetchall()

    if not rows:
        msg = (
            f"No path found between nodes {source_node} and {target_node} "
            f"in region {region_id}."
        )
        raise RouteGenerationError(msg)

    segment_ids = [row[0] for row in rows]
    total_distance = rows[-1][1]  # last row's agg_cost is the total
    estimated_duration = total_distance / WALKING_SPEED_MPS

    return RouteResult(
        segment_ids=segment_ids,
        total_distance=total_distance,
        estimated_duration=estimated_duration,
        start_node=source_node,
        end_node=target_node,
    )
