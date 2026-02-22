"""Module for processing geoportal.gov.pl streets data.

Steets dataset is a base datasource for paths in Poland. It contains all streets in
Poland, with their names and geometries. It is used to create a graph of streets, which
is then used to find paths between points.

This script contains raw data transformation logic using GeoPandas and loading
GeoPackage file which is output of the WFS download.

Actual data ingestion is bound to be rewritten to actually tap into WFS service, but for
now, it's going to be load records from file.

Current datasource:

- https://www.geoportal.gov.pl/pl/usluga/uslugi-pobierania-wfs
- https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaNumeracjiAdresowej

Outputs:
    - Streets GeoPackage with path data and region_code references.
    - Regions CSV with unique regions and convex-hull boundary WKT.
"""

import geopandas as gpd
import pandas as pd

from ..arguments import parse_arguments
from ..utils import setup_logger

logger = setup_logger(__name__)

ARGUMENTS = [
    {
        "name": "--input_path",
        "help": "Path to the input GeoPackage file.",
    },
    {
        "name": "--streets_output_path",
        "help": "Path to the output streets GeoPackage file.",
    },
    {
        "name": "--regions_output_path",
        "help": "Path to the output regions CSV file.",
    },
    {
        "name": "--layer_name",
        "help": "Layer name inside the input GeoPackage.",
    },
]


def _build_region_code(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Add a region_code column from teryt and simc fields.

    Where both teryt and simc are non-null: "{teryt}_{simc}".
    Otherwise: "".
    """
    has_both = gdf["teryt"].notna() & gdf["simc"].notna()
    gdf["region_code"] = ""
    teryt = gdf.loc[has_both, "teryt"].astype(str)
    simc = gdf.loc[has_both, "simc"].astype(str)
    gdf.loc[has_both, "region_code"] = teryt + "_" + simc
    logger.info(
        "Built region_code: %d with code, %d empty",
        has_both.sum(),
        (~has_both).sum(),
    )
    return gdf


def _extract_regions(gdf: gpd.GeoDataFrame, output_path: str) -> None:
    """Extract unique regions and save as CSV with boundary WKT."""
    regions_gdf = gdf[gdf["region_code"] != ""].copy()

    def _hull(g: gpd.GeoSeries) -> object:
        return g.union_all().convex_hull

    grouped = regions_gdf.groupby("region_code").agg(
        name=pd.NamedAgg(column="miejscowosc", aggfunc="first"),
        geometry=pd.NamedAgg(column="geometry", aggfunc=_hull),
    )

    grouped["boundary_wkt"] = grouped["geometry"].apply(lambda g: g.wkt)
    regions_df = grouped[["name", "boundary_wkt"]].reset_index()

    regions_df.to_csv(output_path, index=False)
    logger.info("Saved %d regions to %s", len(regions_df), output_path)


def transform(
    input_path: str,
    streets_output_path: str,
    regions_output_path: str,
    layer_name: str,
) -> None:
    """Read GeoPackage, transform to Path model schema, save streets and regions.

    Args:
        input_path: Path to the input GeoPackage file.
        streets_output_path: Path to the output streets GeoPackage file.
        regions_output_path: Path to the output regions CSV file.
        layer_name: Layer name inside the input GeoPackage.
    """
    gdf = gpd.read_file(input_path, layer=layer_name)
    total_rows = len(gdf)
    logger.info(
        "Loaded %d rows from %s (layer: %s)",
        total_rows,
        input_path,
        layer_name,
    )

    # Drop rows with null or empty geometries
    null_geom_count = gdf.geometry.isna().sum()
    empty_geom_count = gdf.geometry.is_empty.sum()
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]

    # Drop rows with invalid geometries
    invalid_geom_count = (~gdf.geometry.is_valid).sum()
    gdf = gdf[gdf.geometry.is_valid]

    rows_dropped = total_rows - len(gdf)
    logger.info(
        "Dropped %d rows (null geom: %d, empty geom: %d, invalid geom: %d)",
        rows_dropped,
        null_geom_count,
        empty_geom_count,
        invalid_geom_count,
    )

    # Build region_code from teryt + simc
    gdf = _build_region_code(gdf)

    # Extract regions before dropping source columns
    _extract_regions(gdf, regions_output_path)

    # Rename source columns to match Path model schema
    gdf = gdf.rename(columns={"nazwa": "name"})

    # Add Path model columns with defaults
    gdf["category"] = "street"
    gdf["surface"] = ""
    gdf["accessible"] = False
    gdf["is_lit"] = False

    columns_to_keep = [
        "name",
        "geometry",
        "category",
        "surface",
        "accessible",
        "is_lit",
        "region_code",
    ]
    gdf = gdf[columns_to_keep]

    # Log summary
    logger.info("Output rows: %d", len(gdf))
    logger.info("CRS: %s", gdf.crs)
    logger.info("Null counts per column:\n%s", gdf.isnull().sum().to_string())

    gdf.to_file(streets_output_path, driver="GPKG")
    logger.info("Saved streets output to %s", streets_output_path)


if __name__ == "__main__":
    args = parse_arguments(ARGUMENTS)
    transform(
        input_path=args["input_path"],
        streets_output_path=args["streets_output_path"],
        regions_output_path=args["regions_output_path"],
        layer_name=args["layer_name"],
    )
