"""Route generation service using pgRouting."""

import copy
import enum
import itertools
import logging
import math
import random
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from dataclasses import dataclass

from django.db import connection

from paths.models import PathSegment, Segment

logger = logging.getLogger(__name__)

LOOP_CLOSURE_TOLERANCE_M = 250
PROXIMITY_TOLERANCE_M = 100
RETRACE_PENALTY_FACTOR = 5.0
LOOP_DISTANCE_FRACTION = 0.45
PLACE_NODE_MAX_DISTANCE_M = 300.0
TARGET_CANDIDATE_POOL_SIZE = 15
EDGE_COST_JITTER = 0.6
WAYPOINT_DISTANCE_THRESHOLD_M = 2000.0
MAX_ONE_WAY_WAYPOINTS = 2
LOOP_MIN_WAYPOINTS = 2
LOOP_MAX_WAYPOINTS = 4


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
    used_shortest_path: bool = False


def _find_random_node_near_place(
    region_id: int,
    place_lon: float,
    place_lat: float,
    max_distance_m: float = PLACE_NODE_MAX_DISTANCE_M,
) -> int:
    """Find a random network node within a radius of a place.

    Selects a random node within ``max_distance_m`` of the place using
    ``ST_DWithin``. Falls back to the nearest node if none are within
    the radius.

    Args:
        region_id: The region to search nodes in.
        place_lon: Longitude of the place.
        place_lat: Latitude of the place.
        max_distance_m: Maximum distance from place to node in meters.

    Returns:
        A node ID.

    Raises:
        RouteGenerationError: If no nodes are found in the region.
    """
    safe_id = int(region_id)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id FROM (
                SELECT DISTINCT v.id
                FROM segments_vertices_pgr v
                JOIN segments s ON (v.id = s.source OR v.id = s.target)
                WHERE s.region_id = %s
                    AND s.source IS NOT NULL
                    AND s.target IS NOT NULL
                    AND ST_DWithin(
                        v.the_geom::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        %s
                    )
            ) sub
            ORDER BY random()
            LIMIT 1
            """,
            [safe_id, place_lon, place_lat, max_distance_m],
        )
        row = cursor.fetchone()

    if row is not None:
        return row[0]

    # Fallback: nearest node
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, dist FROM (
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
            ORDER BY dist
            LIMIT 1
            """,
            [place_lon, place_lat, safe_id],
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


def get_route_segments(segment_ids: list[int]) -> list[Segment]:
    """Fetch segments by IDs preserving the order from route generation.

    Supports duplicate segment IDs (e.g. dead-end streets walked in both
    directions). Each occurrence gets its own position-specific
    ``sequence_index`` and ``path_id`` via shallow copy.

    Args:
        segment_ids: Ordered list of segment IDs from RouteResult.

    Returns:
        List of Segment objects ordered by the input sequence.
    """
    unique_ids = set(segment_ids)
    seg_map = {s.pk: s for s in Segment.objects.filter(pk__in=unique_ids)}
    path_id_map = dict(
        PathSegment.objects.filter(segment_id__in=unique_ids).values_list(
            "segment_id", "path_id"
        )
    )
    result: list[Segment] = []
    for pos, seg_id in enumerate(segment_ids):
        seg = seg_map.get(seg_id)
        if seg is None:
            continue
        seg_copy = copy.copy(seg)
        seg_copy.sequence_index = pos  # type: ignore[attr-defined]
        seg_copy.path_id = path_id_map.get(seg_id)  # type: ignore[attr-defined]
        result.append(seg_copy)
    return result


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


def stitch_segment_coordinates(
    segments: Iterable[Segment],
) -> list[tuple[float, float]]:
    """Merge ordered segment geometries into a single coordinate list.

    For each segment after the first, compares its endpoints to the last
    accumulated coordinate to determine whether the segment needs reversing.
    Duplicate junction points are skipped.

    Args:
        segments: Ordered queryset of Segment objects.

    Returns:
        List of (lon, lat) coordinate tuples forming one continuous line.
    """
    coords: list[tuple[float, float]] = []
    for segment in segments:
        seg_coords = list(segment.geometry.coords)
        if not coords:
            coords.extend(seg_coords)
            continue

        last = coords[-1]
        first_pt = seg_coords[0]
        last_pt = seg_coords[-1]

        dist_to_first = math.hypot(last[0] - first_pt[0], last[1] - first_pt[1])
        dist_to_last = math.hypot(last[0] - last_pt[0], last[1] - last_pt[1])

        if dist_to_last < dist_to_first:
            seg_coords = list(reversed(seg_coords))

        # Skip duplicate junction point
        if seg_coords[0] == last:
            seg_coords = seg_coords[1:]

        coords.extend(seg_coords)
    return coords


def stitch_segment_coordinates_from_ids(
    segment_ids: list[int],
) -> list[tuple[float, float]]:
    """Merge segment geometries by ID list into a single coordinate list.

    Unlike ``stitch_segment_coordinates``, this works from a segment ID list
    that may contain duplicates (e.g., routes with self-intersections).
    Each occurrence of a segment ID is stitched independently.

    Args:
        segment_ids: Ordered list of segment IDs (may contain duplicates).

    Returns:
        List of (lon, lat) coordinate tuples forming one continuous line.
    """
    if not segment_ids:
        return []

    unique_ids = set(segment_ids)
    geometry_map: dict[int, list[tuple[float, float]]] = {}
    for seg in Segment.objects.filter(pk__in=unique_ids):
        geometry_map[seg.pk] = list(seg.geometry.coords)

    coords: list[tuple[float, float]] = []
    for seg_id in segment_ids:
        seg_coords = list(geometry_map.get(seg_id, []))
        if not seg_coords:
            continue

        if not coords:
            coords.extend(seg_coords)
            continue

        last = coords[-1]
        first_pt = seg_coords[0]
        last_pt = seg_coords[-1]

        dist_to_first = math.hypot(last[0] - first_pt[0], last[1] - first_pt[1])
        dist_to_last = math.hypot(last[0] - last_pt[0], last[1] - last_pt[1])

        if dist_to_last < dist_to_first:
            seg_coords = list(reversed(seg_coords))

        # Skip duplicate junction point
        if seg_coords[0] == last:
            seg_coords = seg_coords[1:]

        coords.extend(seg_coords)
    return coords


def build_gpx_xml(name: str, segments: Iterable[Segment]) -> str:
    """Build a GPX 1.1 XML document from a route name and ordered segments.

    Args:
        name: Route display name.
        segments: Ordered queryset of Segment objects.

    Returns:
        UTF-8 XML string representing a GPX track.
    """
    coords = stitch_segment_coordinates(segments)

    gpx = ET.Element("gpx")
    gpx.set("version", "1.1")
    gpx.set("creator", "Walkie")
    gpx.set("xmlns", "http://www.topografix.com/GPX/1/1")

    metadata = ET.SubElement(gpx, "metadata")
    ET.SubElement(metadata, "name").text = name

    trk = ET.SubElement(gpx, "trk")
    ET.SubElement(trk, "name").text = name
    trkseg = ET.SubElement(trk, "trkseg")

    for lon, lat in coords:
        trkpt = ET.SubElement(trkseg, "trkpt")
        trkpt.set("lat", str(lat))
        trkpt.set("lon", str(lon))

    return ET.tostring(gpx, encoding="unicode", xml_declaration=True)


def build_kml_xml(name: str, segments: Iterable[Segment]) -> str:
    """Build a KML 2.2 XML document from a route name and ordered segments.

    Args:
        name: Route display name.
        segments: Ordered queryset of Segment objects.

    Returns:
        UTF-8 XML string representing a KML document with a LineString.
    """
    coords = stitch_segment_coordinates(segments)

    kml = ET.Element("kml")
    kml.set("xmlns", "http://www.opengis.net/kml/2.2")

    document = ET.SubElement(kml, "Document")
    ET.SubElement(document, "name").text = name

    placemark = ET.SubElement(document, "Placemark")
    ET.SubElement(placemark, "name").text = name
    linestring = ET.SubElement(placemark, "LineString")
    coord_text = " ".join(f"{lon},{lat},0" for lon, lat in coords)
    ET.SubElement(linestring, "coordinates").text = coord_text

    return ET.tostring(kml, encoding="unicode", xml_declaration=True)


def validate_segment_connectivity(segment_ids: list[int]) -> bool:
    """Check that a sequence of segments forms a connected chain.

    For each consecutive pair of segments, first checks if they share a
    topology node. If not, falls back to a PostGIS geographic distance check
    across all four endpoint combinations (start/end of each segment). Pairs
    within ``PROXIMITY_TOLERANCE_M`` are accepted as connected.

    Args:
        segment_ids: Ordered list of segment IDs to validate.

    Returns:
        True if all consecutive pairs are connected (topologically or by
        proximity), or if the list has fewer than two elements.
    """
    if len(segment_ids) < 2:
        return True

    nodes: dict[int, tuple[int | None, int | None]] = {
        seg_id: (source, target)
        for seg_id, source, target in Segment.objects.filter(
            pk__in=segment_ids
        ).values_list("id", "source", "target")
    }

    # Collect pairs that need a proximity check
    proximity_pairs: list[tuple[int, int]] = []

    for a_id, b_id in itertools.pairwise(segment_ids):
        a = nodes.get(a_id)
        b = nodes.get(b_id)
        if a is None or b is None:
            return False
        a_nodes = {n for n in a if n is not None}
        b_nodes = {n for n in b if n is not None}
        if not a_nodes.intersection(b_nodes):
            proximity_pairs.append((a_id, b_id))

    if not proximity_pairs:
        return True

    # Fall back to PostGIS distance check for non-topology-connected pairs
    return all(_segments_within_proximity(a_id, b_id) for a_id, b_id in proximity_pairs)


def _segments_within_proximity(seg_a_id: int, seg_b_id: int) -> bool:
    """Check if two segments have endpoints within proximity tolerance.

    Computes the geographic distance between all four combinations of
    segment endpoints (start/end of A vs start/end of B) and returns
    True if the minimum distance is within ``PROXIMITY_TOLERANCE_M``.

    Args:
        seg_a_id: First segment ID.
        seg_b_id: Second segment ID.

    Returns:
        True if the closest pair of endpoints is within tolerance.
    """
    safe_a = int(seg_a_id)
    safe_b = int(seg_b_id)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT LEAST(
                ST_Distance(
                    ST_StartPoint(a.geometry)::geography,
                    ST_StartPoint(b.geometry)::geography
                ),
                ST_Distance(
                    ST_StartPoint(a.geometry)::geography,
                    ST_EndPoint(b.geometry)::geography
                ),
                ST_Distance(
                    ST_EndPoint(a.geometry)::geography,
                    ST_StartPoint(b.geometry)::geography
                ),
                ST_Distance(
                    ST_EndPoint(a.geometry)::geography,
                    ST_EndPoint(b.geometry)::geography
                )
            ) AS min_dist
            FROM segments a, segments b
            WHERE a.id = %s AND b.id = %s
            """,
            [safe_a, safe_b],
        )
        row = cursor.fetchone()

    if row is None or row[0] is None:
        return False
    return float(row[0]) <= PROXIMITY_TOLERANCE_M


def _generate_one_way_route(
    region_id: int,
    target_distance_m: float,
    start_node_override: int | None = None,
    end_node_override: int | None = None,
) -> RouteResult:
    """Generate a one-way route with optional intermediate waypoints.

    For longer routes, inserts intermediate waypoints to increase variety:
    - < 2km: direct path (randomized costs alone provide variation)
    - 2-5km: 1 intermediate waypoint
    - > 5km: 2 intermediate waypoints

    Each leg uses fresh randomized edge costs, and duplicate segments
    (self-intersections) are allowed.
    """
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

    if start_node_override is not None and end_node_override is not None:
        shortest_result = _compute_shortest_path(
            region_id,
            source_node,
            target_node,
            edges_sql=_build_edges_sql(region_id),
        )
        shortest_distance = compute_segment_distance(shortest_result.segment_ids)
        if target_distance_m < shortest_distance:
            start_point = _get_node_coordinates(source_node)
            end_point = _get_node_coordinates(target_node)
            return RouteResult(
                segment_ids=shortest_result.segment_ids,
                total_distance=shortest_distance,
                start_node=source_node,
                end_node=target_node,
                start_point=start_point,
                end_point=end_point,
                used_shortest_path=True,
            )

    wp_count = _compute_waypoint_count(target_distance_m)
    waypoints = _pick_intermediate_waypoints(
        region_id, source_node, target_distance_m, wp_count
    )

    chain = [source_node, *waypoints, target_node]

    legs: list[RouteResult] = []
    for i in range(len(chain) - 1):
        leg = _compute_shortest_path(region_id, chain[i], chain[i + 1])
        legs.append(leg)

    all_segment_ids = [sid for leg in legs for sid in leg.segment_ids]
    total_distance = sum(compute_segment_distance(leg.segment_ids) for leg in legs)

    start_point = _get_node_coordinates(source_node)
    end_point = _get_node_coordinates(target_node)
    return RouteResult(
        segment_ids=all_segment_ids,
        total_distance=total_distance,
        start_node=source_node,
        end_node=target_node,
        start_point=start_point,
        end_point=end_point,
    )


def _generate_loop_route(
    region_id: int,
    target_distance_m: float,
    start_node_override: int | None = None,
) -> RouteResult:
    """Generate a loop route using a multi-waypoint circuit.

    Selects waypoints sorted by bearing angle from the source to form
    a coherent circuit. Each subsequent leg penalizes segments from all
    previous legs (accumulated penalty), encouraging use of new streets.
    Self-intersections are allowed.

    Falls back to the two-leg approach if waypoint selection fails.

    Args:
        region_id: The region to route in.
        target_distance_m: Target total loop distance in meters.
        start_node_override: If set, use this node as the loop start.

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

    wp_count = _compute_loop_waypoint_count(target_distance_m)
    waypoints = _pick_loop_waypoints(
        region_id, source_node, target_distance_m, wp_count
    )

    if not waypoints:
        return _generate_loop_route_fallback(region_id, target_distance_m, source_node)

    chain = [source_node, *waypoints, source_node]

    legs: list[RouteResult] = []
    accumulated_penalty_ids: list[int] = []
    for i in range(len(chain) - 1):
        if accumulated_penalty_ids:
            edges_sql: str | None = _build_penalized_randomized_edges_sql(
                region_id, accumulated_penalty_ids, RETRACE_PENALTY_FACTOR
            )
        else:
            edges_sql = None  # default randomized edges

        leg = _compute_shortest_path(
            region_id, chain[i], chain[i + 1], edges_sql=edges_sql
        )
        legs.append(leg)
        accumulated_penalty_ids.extend(leg.segment_ids)

    all_segment_ids = [sid for leg in legs for sid in leg.segment_ids]
    total_distance = sum(compute_segment_distance(leg.segment_ids) for leg in legs)

    start_point = _get_node_coordinates(source_node)
    end_point = _get_node_coordinates(source_node)

    return RouteResult(
        segment_ids=all_segment_ids,
        total_distance=total_distance,
        start_node=source_node,
        end_node=source_node,
        start_point=start_point,
        end_point=end_point,
        is_loop=True,
    )


def _generate_loop_route_fallback(
    region_id: int,
    target_distance_m: float,
    source_node: int,
) -> RouteResult:
    """Fallback two-leg loop route with randomized costs.

    Used when multi-waypoint selection fails. Routes outbound to a
    target node and returns via penalized + randomized edges.

    Args:
        region_id: The region to route in.
        target_distance_m: Target total loop distance in meters.
        source_node: Loop start/end node.

    Returns:
        A RouteResult with is_loop=True.

    Raises:
        RouteGenerationError: If the loop cannot be formed.
    """
    outbound_distance = target_distance_m * LOOP_DISTANCE_FRACTION
    target_node = _find_best_target_node(region_id, source_node, outbound_distance)

    outbound = _compute_shortest_path(region_id, source_node, target_node)

    penalized_sql = _build_penalized_randomized_edges_sql(
        region_id, outbound.segment_ids, RETRACE_PENALTY_FACTOR
    )
    return_result = _compute_shortest_path(
        region_id, target_node, source_node, edges_sql=penalized_sql
    )

    outbound_distance_actual = compute_segment_distance(outbound.segment_ids)
    return_distance = compute_segment_distance(return_result.segment_ids)
    total_distance = outbound_distance_actual + return_distance

    combined_ids = outbound.segment_ids + return_result.segment_ids

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
    string for the edges query - parameterized placeholders (%s) cannot be used
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


def _build_randomized_edges_sql(
    region_id: int,
    *,
    jitter: float = EDGE_COST_JITTER,
) -> str:
    """Build edges SQL with random cost jitter for route variation.

    Multiplies each edge cost by a random factor in the range
    ``[1 - jitter/2, 1 + jitter/2]``. PostgreSQL's ``random()`` is
    evaluated once per row when pgRouting reads the subquery, so costs
    are consistent within a single routing call but different across calls.

    Args:
        region_id: Region to filter segments by.
        jitter: Width of the jitter range (default 0.6 gives 0.7x-1.3x).

    Returns:
        SQL string for use as pgRouting edges query.
    """
    safe_id = int(region_id)
    safe_jitter = float(jitter)
    low = 1.0 - safe_jitter / 2
    jitter_expr = f"({low} + random() * {safe_jitter})"
    return f"""
        SELECT id, source, target,
            ST_Length(geometry::geography) * {jitter_expr} AS cost,
            ST_Length(geometry::geography) * {jitter_expr} AS reverse_cost
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


def _build_penalized_randomized_edges_sql(
    region_id: int,
    penalized_segment_ids: list[int],
    penalty_factor: float,
    *,
    jitter: float = EDGE_COST_JITTER,
) -> str:
    """Build edges SQL combining penalty and random jitter.

    Penalized segments get cost multiplied by ``penalty_factor``, and all
    segments get additional random jitter for route variation.

    Args:
        region_id: Region to filter segments by.
        penalized_segment_ids: Segment IDs to penalize.
        penalty_factor: Multiplier applied to penalized segment costs.
        jitter: Width of the jitter range.

    Returns:
        SQL string for use as pgRouting edges query.
    """
    safe_id = int(region_id)
    safe_factor = float(penalty_factor)
    safe_jitter = float(jitter)
    low = 1.0 - safe_jitter / 2
    id_list = ", ".join(str(int(sid)) for sid in penalized_segment_ids)
    jitter_expr = f"({low} + random() * {safe_jitter})"
    penalty_expr = f"ST_Length(geometry::geography) * {safe_factor}"
    base_expr = "ST_Length(geometry::geography)"
    return f"""
        SELECT id, source, target,
            CASE WHEN id IN ({id_list})
                THEN {penalty_expr} * {jitter_expr}
                ELSE {base_expr} * {jitter_expr}
            END AS cost,
            CASE WHEN id IN ({id_list})
                THEN {penalty_expr} * {jitter_expr}
                ELSE {base_expr} * {jitter_expr}
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
    a random node from the top candidates closest to the target distance.

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
            f"""
            SELECT node, agg_cost
            FROM pgr_drivingDistance(%s, %s, %s, directed := false)
            WHERE node != %s
            ORDER BY ABS(agg_cost - %s)
            LIMIT {TARGET_CANDIDATE_POOL_SIZE}
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

    When no ``edges_sql`` is provided, uses randomized edge costs
    so that repeated calls produce different routes.

    Args:
        region_id: The region to route in.
        source_node: Starting node ID.
        target_node: Ending node ID.
        edges_sql: Optional custom edges SQL. When provided, skip building
            default randomized edges.

    Returns:
        A RouteResult with ordered edge IDs and total distance.

    Raises:
        RouteGenerationError: If no path exists between the nodes.
    """
    if edges_sql is None:
        edges_sql = _build_randomized_edges_sql(region_id)

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


def _compute_bearing(
    origin_lon: float,
    origin_lat: float,
    dest_lon: float,
    dest_lat: float,
) -> float:
    """Compute the initial bearing from origin to destination.

    Args:
        origin_lon: Longitude of the origin point.
        origin_lat: Latitude of the origin point.
        dest_lon: Longitude of the destination point.
        dest_lat: Latitude of the destination point.

    Returns:
        Bearing in degrees [0, 360).
    """
    lat1 = math.radians(origin_lat)
    lat2 = math.radians(dest_lat)
    d_lon = math.radians(dest_lon - origin_lon)

    x = math.sin(d_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (
        math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    )

    bearing = math.degrees(math.atan2(x, y))
    return bearing % 360


def _compute_waypoint_count(target_distance_m: float) -> int:
    """Determine the number of intermediate waypoints for a one-way route.

    Args:
        target_distance_m: Target route distance in meters.

    Returns:
        Number of waypoints (0, 1, or 2).
    """
    if target_distance_m < WAYPOINT_DISTANCE_THRESHOLD_M:
        return 0
    if target_distance_m <= 5000.0:
        return 1
    return MAX_ONE_WAY_WAYPOINTS


def _compute_loop_waypoint_count(target_distance_m: float) -> int:
    """Determine the number of waypoints for a loop route.

    Args:
        target_distance_m: Target route distance in meters.

    Returns:
        Number of waypoints (2, 3, or 4).
    """
    if target_distance_m < WAYPOINT_DISTANCE_THRESHOLD_M:
        return LOOP_MIN_WAYPOINTS
    if target_distance_m <= 5000.0:
        return 3
    return LOOP_MAX_WAYPOINTS


def _pick_intermediate_waypoints(
    region_id: int,
    source_node: int,
    target_distance_m: float,
    count: int,
) -> list[int]:
    """Pick intermediate waypoints at evenly-spaced distance fractions.

    Uses ``pgr_drivingDistance`` from source and selects random nodes
    near the target distances (within 30% tolerance band).

    Args:
        region_id: The region to route in.
        source_node: Starting node ID.
        target_distance_m: Total target route distance.
        count: Number of waypoints to pick.

    Returns:
        List of waypoint node IDs (may be shorter than ``count``
        if insufficient candidates exist).
    """
    if count == 0:
        return []

    edges_sql = _build_edges_sql(region_id)
    max_cost = target_distance_m * 1.2

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT node, agg_cost
            FROM pgr_drivingDistance(%s, %s, %s, directed := false)
            WHERE node != %s
            """,
            [edges_sql, source_node, max_cost, source_node],
        )
        rows = cursor.fetchall()

    if not rows:
        return []

    tolerance = 0.3
    waypoints: list[int] = []
    used_nodes: set[int] = {source_node}

    for i in range(1, count + 1):
        fraction = i / (count + 1)
        target_dist = target_distance_m * fraction
        low = target_dist * (1 - tolerance)
        high = target_dist * (1 + tolerance)

        candidates = [
            (node, cost)
            for node, cost in rows
            if low <= cost <= high and node not in used_nodes
        ]

        if not candidates:
            continue

        chosen = random.choice(candidates)
        waypoints.append(chosen[0])
        used_nodes.add(chosen[0])

    return waypoints


def _pick_loop_waypoints(
    region_id: int,
    source_node: int,
    target_distance_m: float,
    count: int,
) -> list[int]:
    """Pick waypoints for a loop route sorted by bearing angle.

    Selects waypoints at approximately ``target_distance / (count + 1)``
    from source, then sorts them by bearing from source to form a
    coherent circuit.

    Args:
        region_id: The region to route in.
        source_node: Starting (and ending) node ID.
        target_distance_m: Total target loop distance.
        count: Number of waypoints to pick.

    Returns:
        List of waypoint node IDs sorted by bearing, or empty list
        if insufficient candidates exist (triggers fallback).
    """
    edges_sql = _build_edges_sql(region_id)
    wp_distance = target_distance_m / (count + 1)
    max_cost = wp_distance * 1.5
    tolerance = 0.3

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT node, agg_cost
            FROM pgr_drivingDistance(%s, %s, %s, directed := false)
            WHERE node != %s
            """,
            [edges_sql, source_node, max_cost, source_node],
        )
        rows = cursor.fetchall()

    if not rows:
        return []

    low = wp_distance * (1 - tolerance)
    high = wp_distance * (1 + tolerance)
    candidates = [(node, cost) for node, cost in rows if low <= cost <= high]

    if len(candidates) < count:
        return []

    selected = random.sample(candidates, count)
    wp_nodes = [node for node, _ in selected]

    source_coords = _get_node_coordinates(source_node)
    bearings: list[tuple[float, int]] = []
    for node in wp_nodes:
        coords = _get_node_coordinates(node)
        bearing = _compute_bearing(
            source_coords[0], source_coords[1], coords[0], coords[1]
        )
        bearings.append((bearing, node))

    bearings.sort()
    return [node for _, node in bearings]
