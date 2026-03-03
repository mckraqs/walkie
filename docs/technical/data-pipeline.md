# Data Pipeline

## Overview

The OSM data pipeline (`data/providers/osm.py`) downloads street data from OpenStreetMap
via the Overpass API for any OSM relation, transforms it into the Path model schema, and
writes output files for the management commands.

## How It Works

1. **Fetch Ways** - queries the Overpass API for walking-relevant highway Ways within
   the area defined by the given OSM relation ID.
2. **Filter by region type** - selects highway types based on region type:
   - **city**: residential, living_street, tertiary, secondary, primary, unclassified,
     and their link variants.
   - **wildlife**: path, track, footway, bridleway, cycleway, steps.
3. **Normalize surfaces** - maps raw OSM `surface` tags to normalized categories
   (asphalt/concrete -> paved, dirt/grass -> unpaved, gravel/compacted -> gravel).
4. **Extract metadata** - reads `wheelchair=yes` for accessibility and `lit=yes` for
   lighting.
5. **Fetch region boundary** - retrieves the relation boundary polygon and parent
   administrative districts (voivodeship at admin level 4, powiat at admin level 6).
6. **Write outputs** - saves a streets GeoPackage and a regions CSV.

## Running the Script

```bash
uv run python -m data.providers.osm \
    --relation_id <OSM_RELATION_ID> \
    --streets_output_path data/processed/streets.gpkg \
    --regions_output_path data/processed/regions.csv \
    --region_type city
```

### Arguments

| Argument                | Description                                  |
| ----------------------- | -------------------------------------------- |
| `--relation_id`         | OSM relation ID for the target area          |
| `--streets_output_path` | Path to the output streets GeoPackage file   |
| `--regions_output_path` | Path to the output regions CSV file          |
| `--region_type`         | Region type: `city` (default) or `wildlife`  |

## Finding an OSM Relation ID

1. Go to [openstreetmap.org](https://www.openstreetmap.org) and search for the desired
   city or area.
2. Click the result and look for the relation in the search results or sidebar.
3. The URL will contain the numeric relation ID
   (e.g., `https://www.openstreetmap.org/relation/123456`).
4. Use that numeric ID as the `--relation_id` argument.

## Output Schemas

### Streets GeoPackage

| Column        | Type            | Description                               |
| ------------- | --------------- | ----------------------------------------- |
| `name`        | string          | Street name from OSM `name` tag           |
| `geometry`    | MultiLineString | Street geometry (EPSG:4326)               |
| `category`    | string          | OSM `highway` tag value                   |
| `surface`     | string          | Normalized surface (paved/gravel/unpaved) |
| `accessible`  | boolean         | `True` if `wheelchair=yes`                |
| `is_lit`      | boolean         | `True` if `lit=yes`                       |
| `region_code` | string          | Region identifier (`osm_{relation_id}`)   |

### Regions CSV

| Column                          | Type   | Description                             |
| ------------------------------- | ------ | --------------------------------------- |
| `region_code`                   | string | Region identifier (`osm_{relation_id}`) |
| `name`                          | string | Relation name from OSM                  |
| `boundary_wkt`                  | string | Boundary polygon as WKT                 |
| `administrative_district_lvl_1` | string | Voivodeship name (admin level 4)        |
| `administrative_district_lvl_2` | string | Powiat name (admin level 6)             |

## Management Commands

After running the pipeline, load the processed data into the database using Django
management commands. Regions must be loaded before paths, because `Path` records
reference `Region` via foreign key.

### `load_regions`

Imports regions from the pipeline's CSV output into the `Region` model.

```bash
uv run python backend/manage.py load_regions data/processed/regions.csv
```

| Option         | Description                                      | Default |
| -------------- | ------------------------------------------------ | ------- |
| `--batch-size` | Number of records per `bulk_create` call         | `500`   |
| `--dry-run`    | Preview the load without writing to the database | off     |

### `load_paths`

Imports streets from the pipeline's GeoPackage output into the `Path` model. Matches
each row's `region_code` to an existing `Region` for the foreign key.

```bash
uv run python backend/manage.py load_paths data/processed/streets.gpkg
```

| Option         | Description                                      | Default |
| -------------- | ------------------------------------------------ | ------- |
| `--batch-size` | Number of records per `bulk_create` call         | `5000`  |
| `--dry-run`    | Preview the load without writing to the database | off     |

### `load_segments`

Creates noded segments from existing paths. Unlike `load_paths` which loads raw path
geometries directly from the pipeline output, `load_segments` operates on paths already
in the database and splits them at every intersection to create routable sub-units.

The noding process:

1. Groups paths by region
2. Converts path geometries to Shapely LineStrings (exploding MultiLineStrings)
3. Runs `unary_union` on all lines in a region to compute intersection points
4. Explodes the result into individual LineStrings - these are the noded segments
5. Attributes each segment back to its parent path(s) using spatial indexing (STRtree)
6. Creates `Segment` records (inheriting name, category, surface, accessible, is_lit
   from parent) and `PathSegment` join records

This is the step that converts raw street data into a routable network. After
`load_segments`, run `build_topology` to assign source/target node IDs to segments.

```bash
uv run python backend/manage.py load_segments
uv run python backend/manage.py load_segments --region-code 0001_0001  # single region
```

| Option          | Description                                           | Default |
| --------------- | ----------------------------------------------------- | ------- |
| `--batch-size`  | Number of records per `bulk_create` call              | `5000`  |
| `--dry-run`     | Preview the operation without writing to the database | off     |
| `--tolerance`   | Buffer tolerance for parent path attribution          | `1e-8`  |
| `--region-code` | Process a single region by code                       | all     |

### `build_topology`

Builds the pgRouting network topology by running `pgr_createTopology` on the `segments`
table. This populates the `source` and `target` columns needed for route generation.

**Must be run after `load_segments`**, because it operates on segments already in the
database.

```bash
uv run python backend/manage.py build_topology
```

| Option        | Description                                | Default   |
| ------------- | ------------------------------------------ | --------- |
| `--tolerance` | Snapping tolerance for node matching       | `0.00001` |
| `--clean`     | Drop and rebuild the topology from scratch | off       |

## Execution Order

The commands must be run in this order:

1. `load_regions`
2. `load_paths`
3. `load_segments`
4. `build_topology`
