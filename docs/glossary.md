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

A street or walkable trail stored in the database, loaded from geoportal data.
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

A geographic area defined by a boundary polygon, identified by a code in the format
`{teryt}_{simc}`. All paths, segments, routes, and places belong to a region. Regions
act as the primary data scope - users favorite regions to access all features within
them.

## Route

A saved walking route consisting of an ordered list of segment IDs, with metadata like
distance, loop status, and walked status. Routes encapsulate the complete path from
start to end, including all geometry and properties. Users can save, name, rename,
delete, mark as walked, and export routes.

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

## Walked Status

A boolean flag on a saved route indicating the user has physically walked it. Walked
routes contribute to the coverage counter, allowing users to track how much of a region
they have explored. A user can toggle a route's walked status after completing the walk.
