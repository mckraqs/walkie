"""Remove walked field from Route model."""

from django.db import migrations


class Migration(migrations.Migration):
    """Remove Route.walked after walk data has been migrated."""

    dependencies = [
        ("routes", "0004_add_custom_geometry_to_route"),
        ("walks", "0002_migrate_walked_routes"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="route",
            name="walked",
        ),
    ]
