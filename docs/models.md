# Models

## Region

A geographic region defined by a boundary polygon. Regions are loaded from the data
pipeline's CSV output using the `load_regions` management command.

**App:** `regions`

| Field                          | Type                      | Description                                |
| ------------------------------ | ------------------------- | ------------------------------------------ |
| `code`                         | `CharField(20, unique)`   | Region identifier, format `{teryt}_{simc}` |
| `name`                         | `CharField(255)`          | Region name                                |
| `boundary`                     | `MultiPolygonField`       | Region boundary (SRID 4326)                |
| `administrative_district_lvl_1`| `CharField(100, blank)`   | First-level administrative district        |
| `administrative_district_lvl_2`| `CharField(100, blank)`   | Second-level administrative district       |
| `description`                  | `TextField(blank)`        | Optional description                       |
| `created_at`                   | `DateTimeField`           | Auto-set on creation                       |
| `updated_at`                   | `DateTimeField`           | Auto-set on save                           |

**Indexes:** `code`

## Path

A street or path segment with geometry and metadata. Paths are loaded from the data
pipeline's GeoPackage output using the `load_streets` management command.

**App:** `paths`

| Field         | Type                    | Description                                      |
| ------------- | ----------------------- | ------------------------------------------------ |
| `region`      | `ForeignKey(Region)`    | Parent region (nullable, `SET_NULL` on delete)    |
| `name`        | `CharField(255, blank)` | Street or path name                              |
| `geometry`    | `MultiLineStringField`  | Path geometry (SRID 4326)                        |
| `category`    | `CharField(50)`         | Path category (e.g. `"street"`)                  |
| `surface`     | `CharField(50, blank)`  | Surface type                                     |
| `accessible`  | `BooleanField`          | Accessibility flag (default `False`)             |
| `is_lit`      | `BooleanField`          | Lighting flag (default `False`)                  |
| `source`      | `IntegerField(null)`    | Topology source node (populated by `build_topology`) |
| `target`      | `IntegerField(null)`    | Topology target node (populated by `build_topology`) |
| `created_at`  | `DateTimeField`         | Auto-set on creation                             |

**Indexes:** `region`, `category`, `source`, `target`

**Relationship:** Each `Path` optionally belongs to one `Region` via the `region`
foreign key. The `related_name` on `Region` is `paths`, so `region.paths.all()` returns
all paths in that region.
