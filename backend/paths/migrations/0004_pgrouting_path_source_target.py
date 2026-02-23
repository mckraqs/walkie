"""Add pgRouting extension and source/target topology columns to Path."""

import django.db.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('paths', '0003_remove_path_paths_region__37df2c_idx_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            "CREATE EXTENSION IF NOT EXISTS pgrouting;",
            "DROP EXTENSION IF EXISTS pgrouting;",
        ),
        migrations.AddField(
            model_name='path',
            name='source',
            field=models.IntegerField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='path',
            name='target',
            field=models.IntegerField(blank=True, db_index=True, null=True),
        ),
    ]
