# Data Pipeline

## Overview

The geoportal data pipeline (`data/providers/geoportal.py`) transforms raw street data
from [geoportal.gov.pl](https://geoportal.gov.pl) into cleaned, schema-aligned files
ready for database ingestion.

The streets dataset is the base datasource for paths in Poland. It contains all streets
with their names and geometries, sourced from a WFS-downloaded GeoPackage.

## Processing Steps

The `transform()` function performs the following:

1. **Load** -- reads the input GeoPackage layer into a GeoDataFrame.
2. **Clean geometries** -- drops rows with null, empty, or invalid geometries.
3. **Build region codes** -- constructs a `region_code` column from `teryt` and `simc`
   fields (format: `{teryt}_{simc}`). Rows missing either field get an empty code.
4. **Extract regions** -- groups rows by `region_code`, computes a convex hull boundary
   for each region, and writes a regions CSV.
5. **Map to Path schema** -- renames `nazwa` to `name`, adds default columns
   (`category="street"`, `surface=""`, `accessible=False`, `is_lit=False`).
6. **Write output** -- saves the cleaned streets GeoPackage.

## Running the Script

```bash
uv run python -m data.providers.geoportal \
    --input_path data/raw/streets.gpkg \
    --streets_output_path data/processed/streets.gpkg \
    --regions_output_path data/processed/regions.csv \
    --layer_name <layer-name>
```

### Arguments

| Argument                | Description                              |
| ----------------------- | ---------------------------------------- |
| `--input_path`          | Path to the input GeoPackage file        |
| `--streets_output_path` | Path to the output streets GeoPackage    |
| `--regions_output_path` | Path to the output regions CSV           |
| `--layer_name`          | Layer name inside the input GeoPackage   |

## Output Schemas

### Streets GeoPackage

| Column        | Type             | Description                          |
| ------------- | ---------------- | ------------------------------------ |
| `name`        | string           | Street name (from `nazwa`)           |
| `geometry`    | MultiLineString  | Street geometry                      |
| `category`    | string           | Always `"street"`                    |
| `surface`     | string           | Surface type (empty by default)      |
| `accessible`  | boolean          | Accessibility flag (default `False`) |
| `is_lit`      | boolean          | Lighting flag (default `False`)      |
| `region_code` | string           | Region identifier (`{teryt}_{simc}`) |

### Regions CSV

| Column         | Type   | Description                                  |
| -------------- | ------ | -------------------------------------------- |
| `region_code`  | string | Region identifier (`{teryt}_{simc}`)         |
| `name`         | string | Region name (from `miejscowosc`)             |
| `boundary_wkt` | string | Convex hull boundary as WKT                  |

## Management Commands

After running the pipeline, load the processed data into the database using Django
management commands. Regions must be loaded before streets, because `Path` records
reference `Region` via foreign key.

### `load_regions`

Imports regions from the pipeline's CSV output into the `Region` model.

```bash
uv run python backend/manage.py load_regions data/processed/regions.csv
```

| Option         | Description                                      | Default |
| -------------- | ------------------------------------------------ | ------- |
| `--batch-size` | Number of records per `bulk_create` call          | `500`   |
| `--dry-run`    | Preview the load without writing to the database  | off     |

### `load_streets`

Imports streets from the pipeline's GeoPackage output into the `Path` model. Matches
each row's `region_code` to an existing `Region` for the foreign key.

```bash
uv run python backend/manage.py load_streets data/processed/streets.gpkg
```

| Option         | Description                                      | Default |
| -------------- | ------------------------------------------------ | ------- |
| `--batch-size` | Number of records per `bulk_create` call          | `5000`  |
| `--dry-run`    | Preview the load without writing to the database  | off     |

### `build_topology`

Builds the pgRouting network topology by running `pgr_createTopology` on the `paths`
table. This populates the `source` and `target` columns needed for route generation.

**Must be run after `load_streets`**, because it operates on paths already in the
database.

Required execution order:

1. `load_regions`
2. `load_streets`
3. `build_topology`

```bash
uv run python backend/manage.py build_topology
```

| Option        | Description                                       | Default     |
| ------------- | ------------------------------------------------- | ----------- |
| `--tolerance`  | Snapping tolerance for node matching              | `0.00001`   |
| `--clean`      | Drop and rebuild the topology from scratch        | off         |
