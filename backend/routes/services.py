"""Route generation service using pgRouting."""

import enum
import itertools
import logging
import random
from dataclasses import dataclass

from django.db import connection
from django.db.models import Case, IntegerField, QuerySet, When

from paths.models import PathSegment, Segment

logger = logging.getLogger(__name__)

LOOP_CLOSURE_TOLERANCE_M = 250
RETRACE_PENALTY_FACTOR = 5.0
LOOP_DISTANCE_FRACTION = 0.45
PLACE_NODE_TARGET_DISTANCE_M = 300.0


class RouteType(enum.StrEnum):
    """Route generation mode."""

    ONE_WAY = "one_way"
    LOOP = "loop"


class RouteGenerationError(Exception):
    """Raised when route generation fails."""


@dataclass(frozen=True)
class RouteResult:
    """Result of a route generation computation."""

    segment_ids: list[int]
    total_distance: float  # meters
    start_node: int
    end_node: int
    start_point: tuple[float, float] | None = None  # (lon, lat)
    end_point: tuple[float, float] | None = None  # (lon, lat)
    is_loop: bool = False


def _find_nearest_node_at_distance(
    region_id: int,
    place_lon: float,
    place_lat: float,
    target_distance_m: float = PLACE_NODE_TARGET_DISTANCE_M,
) -> int:
    """Find the network node closest to a target distance from a place.

    Queries the segment topology nodes filtered by region and finds
    the node whose geographic distance from the place is closest to
    the target distance (default 300m), simulating a short walk to
    the trail network.

    Args:
        region_id: The region to search nodes in.
        place_lon: Longitude of the place.
        place_lat: Latitude of the place.
        target_distance_m: Target distance from place to node in meters.

    Returns:
        The best node ID.

    Raises:
        RouteGenerationError: If no nodes are found in the region.
    """
    safe_id = int(region_id)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, dist
            FROM (
                SELECT DISTINCT v.id,
                    ST_Distance(
                        v.the_geom::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                    ) AS dist
                FROM segments_vertices_pgr v
                JOIN segments s ON (v.id = s.source OR v.id = s.target)
                WHERE s.region_id = %s
                    AND s.source IS NOT NULL
                    AND s.target IS NOT NULL
            ) sub
            ORDER BY ABS(dist - %s)
            LIMIT 1
            """,
            [place_lon, place_lat, safe_id, target_distance_m],
        )
        row = cursor.fetchone()

    if row is None:
        msg = f"No network nodes found in region {region_id} near the specified place."
        raise RouteGenerationError(msg)
    return row[0]


def generate_route(
    region_id: int,
    target_distance_m: float,
    route_type: RouteType = RouteType.ONE_WAY,
    *,
    start_node_override: int | None = None,
    end_node_override: int | None = None,
) -> RouteResult:
    """Generate a route in a region targeting a specific distance.

    Args:
        region_id: The region to generate a route in.
        target_distance_m: Target route distance in meters.
        route_type: Whether to generate a one-way or loop route.
        start_node_override: If set, use this node instead of a random start.
        end_node_override: If set, use this node instead of computed target
            (one-way only).

    Returns:
        A RouteResult with ordered segment IDs and metadata.

    Raises:
        RouteGenerationError: If no routable segments exist or no suitable
            route is found.
    """
    logger.info(
        "Generating %s route: region_id=%d, target_distance_m=%.0f",
        route_type.value,
        region_id,
        target_distance_m,
    )
    match route_type:
        case RouteType.ONE_WAY:
            result = _generate_one_way_route(
                region_id, target_distance_m, start_node_override, end_node_override
            )
        case RouteType.LOOP:
            result = _generate_loop_route(
                region_id, target_distance_m, start_node_override
            )
    logger.info(
        "Route generated: %d segments, %.0fm, nodes %d->%d, is_loop=%s",
        len(result.segment_ids),
        result.total_distance,
        result.start_node,
        result.end_node,
        result.is_loop,
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


def get_route_path_names(segment_ids: list[int]) -> list[str]:
    """Resolve segment IDs to their parent Path names via PathSegment.

    Names are returned in the order they first appear along the route,
    matching the segment_ids traversal sequence.

    Args:
        segment_ids: Ordered list of segment IDs from a route result.

    Returns:
        Unique, non-blank path names in route traversal order.
    """
    if not segment_ids:
        return []
    mapping: dict[int, str] = dict(
        PathSegment.objects.filter(segment_id__in=segment_ids)
        .exclude(path__name="")
        .values_list("segment_id", "path__name")
    )
    seen: set[str] = set()
    result: list[str] = []
    for seg_id in segment_ids:
        name = mapping.get(seg_id)
        if name and name not in seen:
            seen.add(name)
            result.append(name)
    return result


def get_route_path_ids(segment_ids: list[int]) -> list[int]:
    """Resolve segment IDs to their parent Path IDs via PathSegment.

    Args:
        segment_ids: List of segment IDs from a route.

    Returns:
        Distinct path IDs that contain the given segments.
    """
    return list(
        PathSegment.objects.filter(segment_id__in=segment_ids)
        .values_list("path_id", flat=True)
        .distinct()
    )


def validate_segment_connectivity(segment_ids: list[int]) -> bool:
    """Check that a sequence of segments forms a connected topology chain.

    For each consecutive pair of segments, verifies that they share at least
    one topology node (i.e. one segment's source or target matches the other's
    source or target).

    Args:
        segment_ids: Ordered list of segment IDs to validate.

    Returns:
        True if all consecutive pairs are topologically connected, or if the
        list has fewer than two elements. False if any gap is found.
    """
    if len(segment_ids) < 2:
        return True

    nodes: dict[int, tuple[int | None, int | None]] = {
        seg_id: (source, target)
        for seg_id, source, target in Segment.objects.filter(
            pk__in=segment_ids
        ).values_list("id", "source", "target")
    }

    for a_id, b_id in itertools.pairwise(segment_ids):
        a = nodes.get(a_id)
        b = nodes.get(b_id)
        if a is None or b is None:
            return False
        a_nodes = {n for n in a if n is not None}
        b_nodes = {n for n in b if n is not None}
        if not a_nodes.intersection(b_nodes):
            return False

    return True


def _generate_one_way_route(
    region_id: int,
    target_distance_m: float,
    start_node_override: int | None = None,
    end_node_override: int | None = None,
) -> RouteResult:
    """Generate a one-way route from a random source to a distant target."""
    source_node = (
        start_node_override
        if start_node_override is not None
        else _pick_random_source_node(region_id)
    )
    target_node = (
        end_node_override
        if end_node_override is not None
        else _find_best_target_node(region_id, source_node, target_distance_m)
    )
    result = _compute_shortest_path(region_id, source_node, target_node)
    start_point = _get_node_coordinates(source_node)
    end_point = _get_node_coordinates(target_node)
    return RouteResult(
        segment_ids=result.segment_ids,
        total_distance=result.total_distance,
        start_node=result.start_node,
        end_node=result.end_node,
        start_point=start_point,
        end_point=end_point,
    )


def _generate_loop_route(
    region_id: int,
    target_distance_m: float,
    start_node_override: int | None = None,
) -> RouteResult:
    """Generate a loop route that returns near the starting point.

    Uses a two-leg algorithm:
    1. Find a target node at ~45% of target distance from source.
    2. Compute outbound leg S -> T via standard Dijkstra.
    3. Compute return leg T -> S with penalized edges on outbound segments.
    4. Combine both legs and validate closure.

    Args:
        region_id: The region to route in.
        target_distance_m: Target total loop distance in meters.
        start_node_override: If set, use this node as the loop start instead of random.

    Returns:
        A RouteResult with is_loop=True.

    Raises:
        RouteGenerationError: If the loop cannot be formed.
    """
    source_node = (
        start_node_override
        if start_node_override is not None
        else _pick_random_source_node(region_id)
    )
    outbound_distance = target_distance_m * LOOP_DISTANCE_FRACTION
    target_node = _find_best_target_node(region_id, source_node, outbound_distance)

    outbound = _compute_shortest_path(region_id, source_node, target_node)

    penalized_sql = _build_penalized_edges_sql(
        region_id, outbound.segment_ids, RETRACE_PENALTY_FACTOR
    )
    return_result = _compute_shortest_path(
        region_id, target_node, source_node, edges_sql=penalized_sql
    )

    return_distance = compute_segment_distance(return_result.segment_ids)
    total_distance = outbound.total_distance + return_distance

    seen: set[int] = set()
    combined_ids: list[int] = []
    for seg_id in outbound.segment_ids + return_result.segment_ids:
        if seg_id not in seen:
            seen.add(seg_id)
            combined_ids.append(seg_id)

    end_node = return_result.end_node
    if end_node != source_node:
        gap = _compute_node_distance(source_node, end_node)
        if gap > LOOP_CLOSURE_TOLERANCE_M:
            msg = (
                f"Loop route failed to close: gap {gap:.0f}m "
                f"exceeds tolerance {LOOP_CLOSURE_TOLERANCE_M}m."
            )
            raise RouteGenerationError(msg)

    start_point = _get_node_coordinates(source_node)
    end_point = _get_node_coordinates(end_node)

    return RouteResult(
        segment_ids=combined_ids,
        total_distance=total_distance,
        start_node=source_node,
        end_node=end_node,
        start_point=start_point,
        end_point=end_point,
        is_loop=True,
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
    return f"""
        SELECT id, source, target,
            ST_Length(geometry::geography) AS cost,
            ST_Length(geometry::geography) AS reverse_cost
        FROM segments
        WHERE region_id = {safe_id}
            AND source IS NOT NULL
            AND target IS NOT NULL
    """


def _build_penalized_edges_sql(
    region_id: int,
    penalized_segment_ids: list[int],
    penalty_factor: float,
) -> str:
    """Build edges SQL with inflated cost for specific segments.

    Segments in ``penalized_segment_ids`` get their cost multiplied by
    ``penalty_factor``, discouraging the router from retracing them.

    Args:
        region_id: Region to filter segments by.
        penalized_segment_ids: Segment IDs to penalize.
        penalty_factor: Multiplier applied to penalized segment costs.

    Returns:
        SQL string for use as pgRouting edges query.
    """
    safe_id = int(region_id)
    safe_factor = float(penalty_factor)
    id_list = ", ".join(str(int(sid)) for sid in penalized_segment_ids)
    return f"""
        SELECT id, source, target,
            CASE WHEN id IN ({id_list})
                THEN ST_Length(geometry::geography) * {safe_factor}
                ELSE ST_Length(geometry::geography)
            END AS cost,
            CASE WHEN id IN ({id_list})
                THEN ST_Length(geometry::geography) * {safe_factor}
                ELSE ST_Length(geometry::geography)
            END AS reverse_cost
        FROM segments
        WHERE region_id = {safe_id}
            AND source IS NOT NULL
            AND target IS NOT NULL
    """


def compute_segment_distance(segment_ids: list[int]) -> float:
    """Compute the total geographic distance of a list of segments.

    Args:
        segment_ids: List of segment IDs to sum distance for.

    Returns:
        Total distance in meters.

    Raises:
        RouteGenerationError: If no distance can be computed for the given IDs.
    """
    if not segment_ids:
        return 0.0
    id_list = ", ".join(str(int(sid)) for sid in segment_ids)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT SUM(ST_Length(geometry::geography))
            FROM segments
            WHERE id IN ({id_list})
            """
        )
        row = cursor.fetchone()
    if row is None or row[0] is None:
        msg = "Could not compute distance for return leg segments."
        raise RouteGenerationError(msg)
    return float(row[0])


def _compute_node_distance(node_a: int, node_b: int) -> float:
    """Compute the geographic distance between two topology nodes.

    Args:
        node_a: First node ID.
        node_b: Second node ID.

    Returns:
        Distance in meters between the two nodes.
    """
    safe_a = int(node_a)
    safe_b = int(node_b)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT ST_Distance(a.the_geom::geography, b.the_geom::geography)
            FROM segments_vertices_pgr a, segments_vertices_pgr b
            WHERE a.id = %s AND b.id = %s
            """,
            [safe_a, safe_b],
        )
        row = cursor.fetchone()
    if row is None:
        return float("inf")
    return float(row[0])


def _get_node_coordinates(node_id: int) -> tuple[float, float]:
    """Look up the geographic coordinates of a topology node.

    Args:
        node_id: The node ID in segments_vertices_pgr.

    Returns:
        A (longitude, latitude) tuple.

    Raises:
        RouteGenerationError: If the node does not exist.
    """
    safe_id = int(node_id)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT ST_X(the_geom), ST_Y(the_geom)
            FROM segments_vertices_pgr
            WHERE id = %s
            """,
            [safe_id],
        )
        row = cursor.fetchone()
    if row is None:
        msg = f"Node {safe_id} not found in topology."
        raise RouteGenerationError(msg)
    return (float(row[0]), float(row[1]))


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
            """
            SELECT node, agg_cost
            FROM pgr_drivingDistance(%s, %s, %s, directed := false)
            WHERE node != %s
            ORDER BY ABS(agg_cost - %s)
            LIMIT 5
            """,
            [edges_sql, source_node, max_cost, source_node, target_distance_m],
        )
        rows = cursor.fetchall()

    if not rows:
        msg = (
            f"No reachable nodes found within {max_cost:.0f}m "
            f"from node {source_node} in region {region_id}."
        )
        raise RouteGenerationError(msg)

    return random.choice(rows)[0]


def _compute_shortest_path(
    region_id: int,
    source_node: int,
    target_node: int,
    *,
    edges_sql: str | None = None,
) -> RouteResult:
    """Compute the shortest path between two nodes using Dijkstra.

    Args:
        region_id: The region to route in.
        source_node: Starting node ID.
        target_node: Ending node ID.
        edges_sql: Optional custom edges SQL. When provided, skip calling
            ``_build_edges_sql``.

    Returns:
        A RouteResult with ordered edge IDs and total distance.

    Raises:
        RouteGenerationError: If no path exists between the nodes.
    """
    if edges_sql is None:
        edges_sql = _build_edges_sql(region_id)

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT edge, agg_cost
            FROM pgr_dijkstra(%s, %s, %s, directed := false)
            WHERE edge != -1
            ORDER BY seq
            """,
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

    return RouteResult(
        segment_ids=segment_ids,
        total_distance=total_distance,
        start_node=source_node,
        end_node=target_node,
    )
