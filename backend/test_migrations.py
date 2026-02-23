"""Test that all Django model changes have corresponding migrations."""

import pytest
from django.core.management import call_command
from django.test.utils import captured_stdout


@pytest.mark.django_db
def test_no_missing_migrations() -> None:
    """Fail if model definitions are out of sync with migration files.

    Runs ``makemigrations --check --dry-run`` which exits non-zero when
    unapplied model changes are detected. This catches cases where a
    developer adds or modifies a model field but forgets to generate
    the migration.
    """
    with captured_stdout():
        call_command("makemigrations", "--check", "--dry-run", "--no-input")
