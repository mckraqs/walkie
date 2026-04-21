"""Migrate walked routes to Walk records."""

from django.contrib.gis.geos import GEOSGeometry
from django.db import migrations


def migrate_walked_routes(apps, schema_editor):
    """Create Walk records from routes with walked=True."""
    Route = apps.get_model("routes", "Route")
    Walk = apps.get_model("walks", "Walk")
    db_alias = schema_editor.connection.alias
    cursor = schema_editor.connection.cursor()

    walked_routes = Route.objects.using(db_alias).filter(walked=True)
    walks_to_create = []

    for route in walked_routes:
        if route.custom_geometry:
            # custom_geometry is a GEOSGeometry; use ewkt to pass to SQL.
            ewkt = route.custom_geometry.ewkt
            cursor.execute(
                "SELECT ST_Length(ST_GeomFromEWKT(%s)::geography)",
                [ewkt],
            )
            row = cursor.fetchone()
            distance = float(row[0]) if row and row[0] else 0.0
            geometry = route.custom_geometry

        elif route.segment_ids:
            # Stitch segments and compute distance in one query.
            cursor.execute(
                """
                WITH stitched AS (
                    SELECT ST_LineMerge(
                        ST_Collect(sub.geometry ORDER BY sub.pos)
                    ) AS geom
                    FROM (
                        SELECT s.geometry, array_position(%s, s.id) AS pos
                        FROM segments s
                        WHERE s.id = ANY(%s)
                    ) sub
                )
                SELECT geom, ST_Length(geom::geography)
                FROM stitched
                """,
                [route.segment_ids, route.segment_ids],
            )
            row = cursor.fetchone()
            if not row or not row[0]:
                continue
            geometry = GEOSGeometry(row[0])
            distance = float(row[1]) if row[1] else 0.0

        else:
            continue

        walks_to_create.append(
            Walk(
                user_id=route.user_id,
                region_id=route.region_id,
                name=route.name,
                geometry=geometry,
                segment_ids=list(route.segment_ids),
                walked_at=route.created_at.date(),
                distance=distance,
            )
        )

    if walks_to_create:
        Walk.objects.using(db_alias).bulk_create(walks_to_create)


def reverse_migration(apps, schema_editor):
    """Delete Walk records created by the forward migration."""
    Walk = apps.get_model("walks", "Walk")
    db_alias = schema_editor.connection.alias
    Walk.objects.using(db_alias).all().delete()


class Migration(migrations.Migration):
    """Migrate walked routes to Walk records."""

    dependencies = [
        ("walks", "0001_initial"),
        ("routes", "0004_add_custom_geometry_to_route"),
    ]

    operations = [
        migrations.RunPython(migrate_walked_routes, reverse_migration),
    ]
