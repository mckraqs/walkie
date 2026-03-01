"""Preview script for OSM data inspection before pipeline ingestion.

Fetches highway Ways from Overpass for a given relation and writes
a GeoPackage with extra OSM metadata columns for local inspection
(e.g. in QGIS). Prints summary statistics to stdout.

Does NOT fetch region boundary or admin info -- use ``osm.py`` for
the full pipeline.

Usage:
    uv run python -m data.providers.osm_preview \
        --relation_id 4522408 \
        --region_type wildlife \
        --output_path preview.gpkg
"""

from collections import Counter

import geopandas as gpd

from ..arguments import parse_arguments
from ..utils import setup_logger
from .osm import (
    HIGHWAY_TYPES_BY_REGION,
    RegionType,
    _build_ways_query,
    _normalize_surface,
    _overpass_post,
    _parse_way_geometry,
    _should_exclude_way,
)

logger = setup_logger(__name__)

PREVIEW_METADATA_KEYS = (
    "highway",
    "surface",
    "tracktype",
    "sac_scale",
    "trail_visibility",
    "foot",
    "access",
)

ARGUMENTS = [
    {
        "name": "--relation_id",
        "help": "OSM relation ID for the target area.",
        "type": int,
    },
    {
        "name": "--region_type",
        "help": "Type of region: 'city' (default) or 'wildlife'.",
        "default": "city",
        "choices": ["city", "wildlife"],
    },
    {
        "name": "--output_path",
        "help": "Path to the output preview GeoPackage file.",
    },
]


def build_preview_gdf(
    ways: list[dict],
    region_type: RegionType = RegionType.CITY,
) -> gpd.GeoDataFrame:
    """Build a preview GeoDataFrame with extra OSM metadata columns.

    Args:
        ways: List of Way element dicts from the Overpass response.
        region_type: Region type controlling filtering rules.

    Returns:
        GeoDataFrame with path columns plus OSM metadata. CRS is EPSG:4326.
    """
    columns = [
        "osm_id",
        "name",
        "geometry",
        "category",
        "surface",
        "surface_raw",
        "accessible",
        "is_lit",
        "tracktype",
        "sac_scale",
        "trail_visibility",
        "foot",
        "access",
    ]

    rows: list[dict] = []
    skipped = 0

    for way in ways:
        tags = way.get("tags", {})

        if _should_exclude_way(tags, region_type=region_type):
            skipped += 1
            continue

        geom = _parse_way_geometry(way.get("geometry", []))
        if geom is None:
            skipped += 1
            continue

        surface_raw = tags.get("surface", "")
        rows.append(
            {
                "osm_id": way.get("id", 0),
                "name": tags.get("name", ""),
                "geometry": geom,
                "category": tags.get("highway", ""),
                "surface": _normalize_surface(surface_raw),
                "surface_raw": surface_raw,
                "accessible": tags.get("wheelchair") == "yes",
                "is_lit": tags.get("lit") == "yes",
                "tracktype": tags.get("tracktype", ""),
                "sac_scale": tags.get("sac_scale", ""),
                "trail_visibility": tags.get("trail_visibility", ""),
                "foot": tags.get("foot", ""),
                "access": tags.get("access", ""),
            }
        )

    logger.info("Built %d preview rows (skipped %d)", len(rows), skipped)

    if not rows:
        return gpd.GeoDataFrame(
            columns=columns,
            geometry="geometry",
            crs="EPSG:4326",
        )

    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def print_summary(gdf: gpd.GeoDataFrame) -> None:
    """Print summary statistics for a preview GeoDataFrame.

    Args:
        gdf: Preview GeoDataFrame with OSM metadata columns.
    """
    total = len(gdf)
    print(f"\nTotal ways: {total}")

    if total == 0:
        return

    print("\n--- Highway type ---")
    for highway, count in Counter(gdf["category"]).most_common():
        print(f"  {highway}: {count}")

    named = sum(1 for n in gdf["name"] if n)
    print("\n--- Named vs unnamed ---")
    print(f"  Named: {named}")
    print(f"  Unnamed: {total - named}")

    print("\n--- Surface (normalized) ---")
    for surface, count in Counter(gdf["surface"]).most_common():
        label = surface if surface else "(unknown)"
        print(f"  {label}: {count}")

    tracktype_values = [t for t in gdf["tracktype"] if t]
    if tracktype_values:
        print("\n--- Tracktype ---")
        for tt, count in Counter(tracktype_values).most_common():
            print(f"  {tt}: {count}")


def fetch_and_preview(
    relation_id: int,
    output_path: str,
    region_type: RegionType = RegionType.CITY,
) -> gpd.GeoDataFrame:
    """Fetch OSM ways and write a preview GeoPackage.

    Args:
        relation_id: OSM relation ID for the target area.
        output_path: Path to the output GeoPackage file.
        region_type: Region type controlling highway types and filtering.

    Returns:
        The preview GeoDataFrame.
    """
    highway_types = HIGHWAY_TYPES_BY_REGION[region_type]
    query = _build_ways_query(relation_id, highway_types=highway_types)
    logger.info("Fetching preview ways for relation %d", relation_id)
    data = _overpass_post(query)
    ways = [e for e in data.get("elements", []) if e.get("type") == "way"]
    logger.info("Received %d ways", len(ways))

    gdf = build_preview_gdf(ways, region_type=region_type)

    gdf.to_file(output_path, driver="GPKG")
    logger.info("Saved preview to %s", output_path)

    print_summary(gdf)
    return gdf


if __name__ == "__main__":
    args = parse_arguments(ARGUMENTS)
    fetch_and_preview(
        relation_id=args["relation_id"],
        output_path=args["output_path"],
        region_type=RegionType(args["region_type"]),
    )
