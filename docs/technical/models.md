# Models Reference

## Region

A geographic area defined by a boundary polygon.

**App:** `regions`

| Field                          | Type                     | Description                         |
| ------------------------------ | ------------------------ | ----------------------------------- |
| `code`                         | `CharField(20, unique)`  | Region identifier (OSM-based code)  |
| `name`                         | `CharField(255)`         | Region display name                 |
| `boundary`                     | `MultiPolygonField`      | Region boundary (SRID 4326)         |
| `administrative_district_lvl_1`| `CharField(100, blank)`  | Top-level administrative district   |
| `administrative_district_lvl_2`| `CharField(100, blank)`  | Second-level administrative district|
| `description`                  | `TextField(blank)`       | Region description                  |
| `created_at`                   | `DateTimeField`          | Auto-set on creation                |
| `updated_at`                   | `DateTimeField`          | Auto-set on save                    |

**Indexes:** `code`

## Path

A street or walkable trail, loaded from OSM data.

**App:** `paths`

| Field        | Type                                 | Description                                    |
| ------------ | ------------------------------------ | ---------------------------------------------- |
| `region`     | `ForeignKey(Region, null, SET_NULL)` | Parent region (nullable, `SET_NULL` on delete) |
| `geometry`   | `MultiLineStringField`               | Path geometry (SRID 4326)                      |
| `name`       | `CharField(255, blank)`              | Path name (e.g., street name)                  |
| `category`   | `CharField(50)`                      | Path category (e.g., `"street"`)               |
| `surface`    | `CharField(50, blank)`               | Surface type (e.g., `"asphalt"`)               |
| `accessible` | `BooleanField`                       | Accessibility flag (default `False`)           |
| `is_lit`     | `BooleanField`                       | Lighting flag (default `False`)                |
| `created_at` | `DateTimeField`                      | Auto-set on creation                           |

**Indexes:** `region`, `category`

## Segment

A noded sub-unit of Path, split at intersections. Topology (source/target) operates on
segments so that every real intersection becomes a routable node.

**App:** `paths`

| Field        | Type                    | Description                                          |
| ------------ | ----------------------- | ---------------------------------------------------- |
| `region`     | `ForeignKey(Region)`    | Parent region (nullable, `SET_NULL` on delete)       |
| `geometry`   | `LineStringField`       | Segment geometry (SRID 4326)                         |
| `source`     | `IntegerField(null)`    | Topology source node (populated by `build_topology`) |
| `target`     | `IntegerField(null)`    | Topology target node (populated by `build_topology`) |
| `name`       | `CharField(255, blank)` | Inherited from parent Path                           |
| `category`   | `CharField(50)`         | Path category (e.g. `"street"`)                      |
| `surface`    | `CharField(50, blank)`  | Surface type                                         |
| `accessible` | `BooleanField`          | Accessibility flag (default `False`)                 |
| `is_lit`     | `BooleanField`          | Lighting flag (default `False`)                      |
| `created_at` | `DateTimeField`         | Auto-set on creation                                 |

**Indexes:** `region`, `category`, `source`, `target`

## PathSegment

Join table linking paths to their noded segments. Created by the `load_segments`
management command.

**App:** `paths`

| Field     | Type                  | Description                         |
| --------- | --------------------- | ----------------------------------- |
| `path`    | `ForeignKey(Path)`    | Parent path (`CASCADE` on delete)   |
| `segment` | `ForeignKey(Segment)` | Child segment (`CASCADE` on delete) |

**Constraints:** `unique_path_segment` (path, segment)

## Route

A user-saved walking route within a region.

**App:** `routes`

| Field            | Type                                   | Description                                               |
| ---------------- | -------------------------------------- | --------------------------------------------------------- |
| `user`           | `ForeignKey(User)`                     | Route owner (`CASCADE` on delete)                         |
| `region`         | `ForeignKey(Region)`                   | Parent region (`CASCADE` on delete)                       |
| `name`           | `CharField(255)`                       | Route display name                                        |
| `segment_ids`    | `ArrayField(IntegerField)`             | Ordered list of segment IDs                               |
| `total_distance` | `FloatField`                           | Route distance in meters                                  |
| `is_loop`        | `BooleanField`                         | Whether the route is a loop (default `False`)             |
| `is_custom`      | `BooleanField`                         | Whether the route was manually composed (default `False`) |
| `custom_geometry`| `LineStringField(null)`                | Optional hand-drawn route geometry (SRID 4326)            |
| `start_point`    | `ArrayField(FloatField, size=2, null)` | Start coordinates `[lon, lat]`                            |
| `end_point`      | `ArrayField(FloatField, size=2, null)` | End coordinates `[lon, lat]`                              |
| `created_at`     | `DateTimeField`                        | Auto-set on creation                                      |

**Indexes:** `(user, region)` **Ordering:** `-created_at`

## Walk

A recorded walk with its own geometry, independent from routes. Walks are the sole
source of truth for region walk coverage.

**App:** `walks`

| Field          | Type                       | Description                                     |
| -------------- | -------------------------- | ----------------------------------------------- |
| `user`         | `ForeignKey(User)`         | Walk owner (`CASCADE` on delete)                |
| `region`       | `ForeignKey(Region)`       | Parent region (`CASCADE` on delete)             |
| `name`         | `CharField(255)`           | Walk display name                               |
| `geometry`     | `LineStringField`          | Walk geometry (SRID 4326)                       |
| `segment_ids`  | `ArrayField(IntegerField)` | Matched segment IDs (computed at creation time) |
| `walked_at`    | `DateField`                | Date the walk was taken                         |
| `distance`     | `FloatField`               | Walk distance in meters                         |
| `created_at`   | `DateTimeField`            | Auto-set on creation                            |

**Indexes:** `(user, region)`, `walked_at` **Ordering:** `-walked_at`, `-created_at`

## Place

A user-defined named location within a region.

**App:** `places`

| Field        | Type                 | Description                         |
| ------------ | -------------------- | ----------------------------------- |
| `user`       | `ForeignKey(User)`   | Place owner (`CASCADE` on delete)   |
| `region`     | `ForeignKey(Region)` | Parent region (`CASCADE` on delete) |
| `name`       | `CharField(255)`     | Place name                          |
| `location`   | `PointField`         | Geographic location (SRID 4326)     |
| `created_at` | `DateTimeField`      | Auto-set on creation                |
| `updated_at` | `DateTimeField`      | Auto-set on save                    |

**Indexes:** `(user, region)` **Constraints:** `unique_user_region_place_name` (user,
region, name)

## FavoriteRegion

A user's favorited region.

**App:** `users`

| Field        | Type                 | Description                  |
| ------------ | -------------------- | ---------------------------- |
| `user`       | `ForeignKey(User)`   | User (`CASCADE` on delete)   |
| `region`     | `ForeignKey(Region)` | Region (`CASCADE` on delete) |
| `created_at` | `DateTimeField`      | Auto-set on creation         |

**Constraints:** `unique_user_favorite_region` (user, region)
