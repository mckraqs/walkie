"""OpenStreetMap data provider for walking-relevant road data.

Downloads highway Ways from the Overpass API for a given OSM relation,
transforms them into the Path model schema, and writes output files
compatible with the downstream pipeline (load_regions -> load_paths ->
load_segments -> build_topology).

Outputs:
    - Streets GeoPackage with path data and region_code references.
    - Regions CSV with boundary WKT and administrative district info.
"""

import csv
import time
from dataclasses import dataclass

import geopandas as gpd
import requests
from shapely.geometry import LineString, MultiLineString, Polygon
from shapely.ops import polygonize, unary_union

from ..arguments import parse_arguments
from ..utils import setup_logger

logger = setup_logger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 180
OSM_AREA_OFFSET = 3_600_000_000

WALKING_HIGHWAY_TYPES = (
    "residential",
    "living_street",
    "tertiary",
    "tertiary_link",
    "secondary",
    "secondary_link",
    "primary",
    "primary_link",
    "unclassified",
    "trunk_link",
)

SURFACE_MAP: dict[str, str] = {
    "asphalt": "paved",
    "concrete": "paved",
    "paving_stones": "paved",
    "sett": "paved",
    "cobblestone": "paved",
    "concrete:plates": "paved",
    "concrete:lanes": "paved",
    "metal": "paved",
    "gravel": "gravel",
    "fine_gravel": "gravel",
    "compacted": "gravel",
    "pebblestone": "gravel",
    "dirt": "unpaved",
    "earth": "unpaved",
    "grass": "unpaved",
    "ground": "unpaved",
    "mud": "unpaved",
    "sand": "unpaved",
    "woodchips": "unpaved",
    "unpaved": "unpaved",
}

EXCLUDED_ACCESS = {"private", "no"}

ARGUMENTS = [
    {
        "name": "--relation_id",
        "help": "OSM relation ID for the target area.",
        "type": int,
    },
    {
        "name": "--streets_output_path",
        "help": "Path to the output streets GeoPackage file.",
    },
    {
        "name": "--regions_output_path",
        "help": "Path to the output regions CSV file.",
    },
]


@dataclass
class RegionInfo:
    """Metadata for a single region derived from an OSM relation."""

    region_code: str
    name: str
    boundary_wkt: str
    administrative_district_lvl_1: str
    administrative_district_lvl_2: str


def _build_ways_query(relation_id: int) -> str:
    """Build an Overpass QL query for walking-relevant highway Ways.

    Args:
        relation_id: OSM relation ID.

    Returns:
        Overpass QL query string.
    """
    area_id = relation_id + OSM_AREA_OFFSET
    highway_regex = "^(" + "|".join(WALKING_HIGHWAY_TYPES) + ")$"
    return (
        f"[out:json][timeout:{OVERPASS_TIMEOUT}];"
        f"area(id:{area_id})->.searchArea;"
        f'way["highway"~"{highway_regex}"](area.searchArea);'
        f"out geom;"
    )


def _build_relation_query(relation_id: int) -> str:
    """Build an Overpass QL query for a relation's geometry.

    Args:
        relation_id: OSM relation ID.

    Returns:
        Overpass QL query string.
    """
    return f"[out:json][timeout:{OVERPASS_TIMEOUT}];relation({relation_id});out geom;"


def _build_parent_admin_query(relation_id: int, admin_level: int) -> str:
    """Build an Overpass QL query for a parent admin relation.

    Args:
        relation_id: OSM relation ID of the child area.
        admin_level: Admin level to look up (4 = voivodeship, 6 = powiat).

    Returns:
        Overpass QL query string.
    """
    return (
        f"[out:json][timeout:{OVERPASS_TIMEOUT}];"
        f"relation({relation_id});"
        f'<<;relation._["admin_level"="{admin_level}"];'
        f"out tags;"
    )


def _overpass_post(query: str, *, max_retries: int = 3) -> dict:
    """Send a query to the Overpass API and return the JSON response.

    Retries on 429 and 504 responses with exponential backoff.

    Args:
        query: Overpass QL query string.
        max_retries: Maximum number of retry attempts.

    Returns:
        Parsed JSON response dict.

    Raises:
        requests.HTTPError: If the API returns a non-2xx status after retries.
    """
    for attempt in range(max_retries + 1):
        response = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=OVERPASS_TIMEOUT + 30,
        )
        if response.status_code in (429, 504) and attempt < max_retries:
            wait = 10 * (attempt + 1)
            logger.warning(
                "Overpass returned %d, retrying in %ds (attempt %d/%d)",
                response.status_code,
                wait,
                attempt + 1,
                max_retries,
            )
            time.sleep(wait)
            continue
        response.raise_for_status()
        return response.json()
    msg = "Unreachable"
    raise AssertionError(msg)


def _should_exclude_way(tags: dict[str, str]) -> bool:
    """Check whether a Way should be excluded based on its tags.

    Args:
        tags: OSM tags dict for the Way.

    Returns:
        True if the Way should be filtered out.
    """
    if not tags.get("name"):
        return True
    if tags.get("area") == "yes":
        return True
    if tags.get("foot") == "no":
        return True
    return tags.get("access") in EXCLUDED_ACCESS


def _parse_way_geometry(
    geometry_coords: list[dict[str, float]],
) -> MultiLineString | None:
    """Convert Overpass geometry coordinates to a MultiLineString.

    Args:
        geometry_coords: List of dicts with "lat" and "lon" keys.

    Returns:
        MultiLineString geometry, or None if fewer than 2 points.
    """
    if len(geometry_coords) < 2:
        return None
    coords = [(pt["lon"], pt["lat"]) for pt in geometry_coords]
    return MultiLineString([LineString(coords)])


def _normalize_surface(raw: str) -> str:
    """Map an OSM surface tag value to a normalized category.

    Args:
        raw: Raw surface tag value from OSM.

    Returns:
        One of "paved", "gravel", "unpaved", or "" if unknown.
    """
    return SURFACE_MAP.get(raw, "")


def _fetch_ways(relation_id: int) -> list[dict]:
    """Fetch walking-relevant highway Ways from Overpass.

    Args:
        relation_id: OSM relation ID.

    Returns:
        List of Way element dicts from the Overpass response.
    """
    query = _build_ways_query(relation_id)
    logger.info("Fetching ways for relation %d", relation_id)
    data = _overpass_post(query)
    elements = [e for e in data.get("elements", []) if e.get("type") == "way"]
    logger.info("Received %d ways", len(elements))
    return elements


def _build_streets_gdf(
    ways: list[dict],
    region_code: str,
) -> gpd.GeoDataFrame:
    """Transform Overpass Way elements into a GeoDataFrame.

    Applies tag mapping and filtering to produce columns matching
    the Path model schema.

    Args:
        ways: List of Way element dicts from Overpass.
        region_code: Region code to assign to all rows.

    Returns:
        GeoDataFrame with columns: name, geometry, category, surface,
        accessible, is_lit, region_code. CRS is EPSG:4326.
    """
    rows: list[dict] = []
    skipped = 0

    for way in ways:
        tags = way.get("tags", {})

        if _should_exclude_way(tags):
            skipped += 1
            continue

        geom = _parse_way_geometry(way.get("geometry", []))
        if geom is None:
            skipped += 1
            continue

        rows.append(
            {
                "name": tags.get("name", ""),
                "geometry": geom,
                "category": tags.get("highway", ""),
                "surface": _normalize_surface(tags.get("surface", "")),
                "accessible": tags.get("wheelchair") == "yes",
                "is_lit": tags.get("lit") == "yes",
                "region_code": region_code,
            }
        )

    logger.info("Built %d street rows (skipped %d)", len(rows), skipped)

    if not rows:
        return gpd.GeoDataFrame(
            columns=[
                "name",
                "geometry",
                "category",
                "surface",
                "accessible",
                "is_lit",
                "region_code",
            ],
            geometry="geometry",
            crs="EPSG:4326",
        )

    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


def _assemble_boundary(elements: list[dict]) -> str:
    """Assemble a boundary polygon from relation member Ways.

    Extracts outer member geometries, attempts polygonize, then falls
    back to convex hull of all coordinates.

    Args:
        elements: List of element dicts from an Overpass relation query.

    Returns:
        WKT string of the assembled boundary polygon.
    """
    lines: list[LineString] = []

    for element in elements:
        if element.get("type") != "relation":
            continue
        for member in element.get("members", []):
            if member.get("type") != "way":
                continue
            role = member.get("role", "")
            if role not in ("outer", ""):
                continue
            geom_coords = member.get("geometry", [])
            if len(geom_coords) < 2:
                continue
            coords = [(pt["lon"], pt["lat"]) for pt in geom_coords]
            lines.append(LineString(coords))

    if not lines:
        msg = "No outer boundary Ways found in relation elements"
        raise ValueError(msg)

    polygons = list(polygonize(lines))
    if polygons:
        boundary = unary_union(polygons)
        return boundary.wkt

    all_coords = [c for line in lines for c in line.coords]
    hull = MultiLineString(lines).convex_hull
    if isinstance(hull, Polygon) and not hull.is_empty:
        return hull.wkt

    from shapely.geometry import MultiPoint

    return MultiPoint(all_coords).convex_hull.wkt


def _fetch_parent_admin_name(relation_id: int, admin_level: int) -> str:
    """Fetch the name of a parent admin district.

    Args:
        relation_id: OSM relation ID of the child area.
        admin_level: Admin level (4 = voivodeship, 6 = powiat).

    Returns:
        Name of the parent admin district, or "" if not found.
    """
    query = _build_parent_admin_query(relation_id, admin_level)
    try:
        data = _overpass_post(query)
    except requests.HTTPError:
        logger.warning(
            "Failed to fetch admin level %d for relation %d",
            admin_level,
            relation_id,
        )
        return ""

    for element in data.get("elements", []):
        if element.get("type") != "relation":
            continue
        tags = element.get("tags", {})
        if tags.get("admin_level") == str(admin_level):
            return tags.get("name", "")
    return ""


def _fetch_region_info(relation_id: int) -> RegionInfo:
    """Fetch region metadata from the Overpass API.

    Retrieves the relation boundary and parent admin districts.

    Args:
        relation_id: OSM relation ID.

    Returns:
        RegionInfo with boundary WKT and admin district names.
    """
    region_code = f"osm_{relation_id}"

    query = _build_relation_query(relation_id)
    logger.info("Fetching relation boundary for %d", relation_id)
    data = _overpass_post(query)
    elements = data.get("elements", [])

    relation_name = ""
    for element in elements:
        if element.get("type") == "relation":
            relation_name = element.get("tags", {}).get("name", "")
            break

    boundary_wkt = _assemble_boundary(elements)
    logger.info("Assembled boundary for %s (%s)", region_code, relation_name)

    voivodeship = _fetch_parent_admin_name(relation_id, admin_level=4)
    district = _fetch_parent_admin_name(relation_id, admin_level=6)

    return RegionInfo(
        region_code=region_code,
        name=relation_name,
        boundary_wkt=boundary_wkt,
        administrative_district_lvl_1=voivodeship,
        administrative_district_lvl_2=district,
    )


def _write_streets_gpkg(gdf: gpd.GeoDataFrame, output_path: str) -> None:
    """Write streets GeoDataFrame to a GeoPackage file.

    Args:
        gdf: GeoDataFrame with Path model columns.
        output_path: Destination file path.
    """
    gdf.to_file(output_path, driver="GPKG")
    logger.info("Saved %d streets to %s", len(gdf), output_path)


def _write_region_csv(region_info: RegionInfo, output_path: str) -> None:
    """Write region info to a CSV file matching load_regions format.

    Args:
        region_info: RegionInfo dataclass instance.
        output_path: Destination file path.
    """
    fieldnames = [
        "region_code",
        "name",
        "boundary_wkt",
        "administrative_district_lvl_1",
        "administrative_district_lvl_2",
    ]
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow(
            {
                "region_code": region_info.region_code,
                "name": region_info.name,
                "boundary_wkt": region_info.boundary_wkt,
                "administrative_district_lvl_1": (
                    region_info.administrative_district_lvl_1
                ),
                "administrative_district_lvl_2": (
                    region_info.administrative_district_lvl_2
                ),
            }
        )
    logger.info("Saved region to %s", output_path)


def download_and_transform(
    relation_id: int,
    streets_output_path: str,
    regions_output_path: str,
) -> None:
    """Download OSM data and produce streets GeoPackage + regions CSV.

    Orchestrates the full pipeline: fetch Ways from Overpass, transform
    to GeoDataFrame, fetch region boundary and admin info, write outputs.

    Args:
        relation_id: OSM relation ID for the target area.
        streets_output_path: Path to the output streets GeoPackage file.
        regions_output_path: Path to the output regions CSV file.
    """
    region_code = f"osm_{relation_id}"

    ways = _fetch_ways(relation_id)
    gdf = _build_streets_gdf(ways, region_code)
    logger.info("Streets GeoDataFrame: %d rows, CRS=%s", len(gdf), gdf.crs)

    region_info = _fetch_region_info(relation_id)

    _write_streets_gpkg(gdf, streets_output_path)
    _write_region_csv(region_info, regions_output_path)

    logger.info("Done: %d streets, region=%s", len(gdf), region_code)


if __name__ == "__main__":
    args = parse_arguments(ARGUMENTS)
    download_and_transform(
        relation_id=args["relation_id"],
        streets_output_path=args["streets_output_path"],
        regions_output_path=args["regions_output_path"],
    )
