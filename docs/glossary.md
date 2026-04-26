# Glossary

## Compose/Custom Route

A route manually assembled by clicking individual segments on the map, as opposed to
auto-generated routes. Marked with `is_custom=True` in the database. Users compose
custom routes when they want to create a specific path that doesn't match algorithmic
generation, such as following a scenic detour or historic trail.

## Favorite Region

A region a user has bookmarked. Many features (routes, places, walked tracking) are
restricted to favorited regions. Users must favorite a region before they can generate
routes, save places, or track walked paths within it. Favoriting creates a
`FavoriteRegion` record linking the user to the region.

## Loop Route

A generated route that returns to its starting point (`is_loop=True`). Uses waypoints
sorted by bearing angle and retrace penalties to discourage walking the same segment
twice. Loop routes are ideal for local exploration when a user doesn't want to navigate
to a distant endpoint.

## One-Way Route

A generated route with distinct start and end points. Uses intermediate waypoints for
longer distances (2+ km) to create natural walking paths that progress from origin to
destination. One-way routes are suitable when users want a directed walk or have
specific endpoints in mind.

## Path

A street or walkable trail stored in the database, loaded from OSM data.
Represented as a MultiLineString geometry to capture complex road networks and
multi-segment footpaths. Paths are the raw input data from which routable Segments are
derived.

## PathSegment

A join table linking a Path to its constituent Segments. Created during the noding
process when a Path is split at intersections. PathSegment entries establish the
many-to-many relationship between paths and their smaller, routable sub-units.

## Place

A user-defined named location (point) within a region. Can be used as a start or end
point for route generation. Places allow users to save favorite locations like "Home",
"Coffee Shop", or "Park Entrance" and reference them when requesting routes, without
needing to specify exact coordinates repeatedly.

## Region

A geographic area defined by a boundary polygon, identified by an OSM-based code. All
paths, segments, routes, and places belong to a region. Regions act as the primary data
scope - users favorite regions to access all features within them.

## Route

A saved walking route consisting of an ordered list of segment IDs, with metadata like
distance, loop status, and custom geometry. Routes encapsulate the complete path from
start to end, including all geometry and properties. Users can save, name, rename,
delete, and export routes. Routes are plans; walks track completion.

## Segment

A noded sub-unit of a Path, split at every intersection. Segments have source and target
topology nodes and form the routable network. Unlike paths (which may be complex
MultiLineStrings), each segment is a single LineString connecting two unique topology
nodes, making it suitable for shortest-path routing.

## Topology

The graph structure built by pgRouting (`pgr_createTopology`) on segments. Each segment
gets source and target node IDs used for shortest-path routing. Topology transforms
a collection of segments into a directed, weighted graph where Dijkstra's algorithm can
compute optimal routes.

## Walk

A record of a completed walk with its own geometry, walked date, distance, and matched
segment references. Walks are independent from routes and are the primary mechanism for
tracking walking progress. Created by uploading a GPX file, drawing on the map, or
selecting an existing saved route.

## Walk Coverage

The proportion of a region's streets that a user has walked. Coverage is derived from
Walk records: each walk's geometry is matched to street segments, and a street counts as
walked when 50% or more of its segments are covered. Named streets are evaluated by name
(all segments sharing a name are grouped); unnamed paths are evaluated individually.
