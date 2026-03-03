# Route Generation

## Overview

Walkie generates walking routes using pgRouting's Dijkstra algorithm with randomized
edge costs. The randomization ensures that repeated requests for the same parameters
produce different routes, avoiding monotonous or identical suggestions. The routing
engine balances distance optimization with route diversity and walkability.

## Network Model

The routable network consists of Segments with source and target topology nodes, built
by `pgr_createTopology`. Each segment is a LineString connecting two unique topology
nodes (representing intersections or line endpoints).

Edge costs are `ST_Length(geometry::geography)` in meters, which accurately computes
geographic distance accounting for the Earth's curvature.

## Cost Randomization

Each edge cost is multiplied by a random jitter factor in the range `[1 -
EDGE_COST_JITTER/2, 1 + EDGE_COST_JITTER/2]` = `[0.7, 1.3]`. PostgreSQL's `random()`
function is evaluated per row during each routing call, making costs consistent within
a single route computation but different across separate calls.

This approach ensures:

- **Variety**: Repeated requests with identical parameters yield different routes.
- **Consistency**: A single route generation uses stable costs across all its legs.
- **Fairness**: All edges have an equal probability distribution, avoiding biased
  preference for specific segments.

## One-Way Route Generation

A one-way route has distinct start and end points, progressing from origin to
destination.

### Algorithm

1. **Select source node**: Use the specified place/coordinates (if provided), or pick
   a random valid network node within the region.

2. **Select target node**: Use `pgr_drivingDistance` to find nodes within
   `target_distance * 1.2` (20% overshoot). Sample up to 15 target candidates and pick
   the one closest to the desired distance.

3. **Determine intermediate waypoints**:
   - Less than 2 km: 0 waypoints (direct route)
   - 2 to 5 km: 1 waypoint
   - Greater than 5 km: 2 waypoints

4. **Select waypoint locations**: Distribute waypoints evenly along the expected path.
   For each waypoint, find a node at the fractional distance (e.g., 1/3 of total for
   first waypoint in a two-waypoint route) with a 30% tolerance band.

5. **Route each leg**: Compute shortest path from source to first waypoint, then
   waypoint to waypoint, then final waypoint to target. Each leg uses independently
   randomized edge costs.

6. **Optimization for direct paths**: If both start and end are user-specified and the
   target distance is less than the shortest path distance, return the shortest path
   directly without waypoints.

### Output

A list of segment IDs traversed in order, with total distance in meters and waypoint
coordinates (if applicable).

## Loop Route Generation

A loop route starts and ends at the same node, forming a circuit suitable for local
exploration.

### Loop Route Algorithm

1. **Select source node**: Use the specified place/coordinates (if provided), or pick
   a random valid network node. This node is also the end point.

2. **Determine intermediate waypoints**:
   - Less than 2 km: 2 waypoints
   - 2 to 5 km: 3 waypoints
   - Greater than 5 km: 4 waypoints

3. **Find waypoint candidates**: Use `pgr_drivingDistance` to find nodes at
   `target_distance / (waypoint_count + 1)` from the source (e.g., for 2 waypoints and 4
   km target, find nodes at 1.3 km and 2.6 km).

4. **Sort by bearing angle**: Order selected waypoints by their bearing angle from the
   source to form a coherent circuit. This avoids crossing paths and creates intuitive
   loops.

5. **Route each leg with retrace penalties**: Route from source to waypoint 1, then to
   waypoint 2, etc., returning to source. Segments already traversed in previous legs
   are penalized: their cost is multiplied by `RETRACE_PENALTY_FACTOR` (5.0x) in
   addition to random jitter. This strongly discourages retracing.

6. **Fallback two-leg approach**: If waypoint selection fails, use a simplified
   fallback:
   - Route outbound to a node at `target_distance * LOOP_DISTANCE_FRACTION` (45% of
     target)
   - Route return to source with penalized + randomized edge costs
   - Verify loop closure (start and end coordinates match) within
     `LOOP_CLOSURE_TOLERANCE_M` (250m)

### Loop Route Output

A list of segment IDs forming a loop, with total distance in meters and loop closure
verified.

## Place-Based Start/End Points

When a user specifies a Place or map coordinates as start/end:

1. Query `ST_DWithin` to find network nodes within `PLACE_NODE_MAX_DISTANCE_M` (300m).
2. If matches exist, randomly select one.
3. If no matches exist within the distance threshold, fall back to the single nearest
   node (using `ST_Distance` and `ORDER BY ... LIMIT 1`).

This ensures users can always generate routes even if their chosen place or point is not
directly on the network.

## Segment Stitching

`stitch_segment_coordinates()` merges ordered segment geometries into a continuous
coordinate list:

1. Start with the first segment's coordinates.
2. For each subsequent segment, compare its endpoints to the previous segment's end
   point.
3. Determine orientation: if the segment's start point matches the previous end,
   traverse forward; if the segment's end point matches, traverse in reverse.
4. Skip the first (duplicate) point of each subsequent segment to avoid junction point
   duplication.
5. Append remaining coordinates to the stitched list.

The result is a single, continuous LineString ready for export.

## Export Formats

### GPX 1.1

XML format (application/gpx+xml) with the following structure:

```xml
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="..." lon="...">
        <ele>...</ele>
        <time>...</time>
      </trkpt>
      ...
    </trkseg>
  </trk>
</gpx>
```

Latitude/longitude attributes use decimal degrees (WGS84). Elevation is set to 0 if not
available.

## Constants

| Constant                        | Value  | Description                                             |
| ------------------------------- | ------ | ------------------------------------------------------- |
| `LOOP_CLOSURE_TOLERANCE_M`      | 250    | Max gap (m) between start and end for loop acceptance   |
| `PROXIMITY_TOLERANCE_M`         | 100    | Max distance (m) for segment connectivity fallback      |
| `RETRACE_PENALTY_FACTOR`        | 5.0    | Cost multiplier for already-used segments in loops      |
| `LOOP_DISTANCE_FRACTION`        | 0.45   | Outbound distance fraction for two-leg loop fallback    |
| `PLACE_NODE_MAX_DISTANCE_M`     | 300.0  | Max distance (m) from place to nearest node             |
| `TARGET_CANDIDATE_POOL_SIZE`    | 15     | Number of target node candidates to sample from         |
| `EDGE_COST_JITTER`              | 0.6    | Width of random cost jitter range (0.7x to 1.3x)        |
| `WAYPOINT_DISTANCE_THRESHOLD_M` | 2000.0 | Distance below which no intermediate waypoints are used |
| `MAX_ONE_WAY_WAYPOINTS`         | 2      | Max intermediate waypoints for one-way routes           |
| `LOOP_MIN_WAYPOINTS`            | 2      | Min waypoints for loop routes                           |
| `LOOP_MAX_WAYPOINTS`            | 4      | Max waypoints for loop routes                           |
