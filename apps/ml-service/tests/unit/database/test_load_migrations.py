from importlib.resources import files
from pathlib import Path

import pytest

from ml_service.database.migration_runner import (
    InvalidMigrationsError,
    Migration,
    load_migrations,
)


def test_loads_migrations_in_version_order(tmp_path: Path) -> None:
    (tmp_path / "002_add_index.sql").write_text("CREATE INDEX ...;")
    (tmp_path / "001_create_table.sql").write_text("CREATE TABLE ...;")
    (tmp_path / "README.md").write_text("not a migration")

    migrations = load_migrations(tmp_path)

    assert migrations == [
        Migration(version=1, name="create_table", sql="CREATE TABLE ...;"),
        Migration(version=2, name="add_index", sql="CREATE INDEX ...;"),
    ]


@pytest.mark.parametrize(
    "file_name", ["1_create_table.sql", "001-create-table.sql", "001_Create.sql"]
)
def test_rejects_badly_named_files(tmp_path: Path, file_name: str) -> None:
    (tmp_path / file_name).write_text("SELECT 1;")

    with pytest.raises(InvalidMigrationsError, match=r"NNN_name\.sql"):
        load_migrations(tmp_path)


@pytest.mark.parametrize(
    "file_names",
    [
        ["001_a.sql", "003_c.sql"],
        ["001_a.sql", "001_b.sql"],
        ["002_b.sql"],
    ],
)
def test_rejects_gaps_and_duplicate_versions(tmp_path: Path, file_names: list[str]) -> None:
    for file_name in file_names:
        (tmp_path / file_name).write_text("SELECT 1;")

    with pytest.raises(InvalidMigrationsError, match="without gaps or duplicates"):
        load_migrations(tmp_path)


def test_checksum_changes_with_the_sql() -> None:
    original = Migration(version=1, name="a", sql="SELECT 1;")
    edited = Migration(version=1, name="a", sql="SELECT 2;")

    assert original.checksum != edited.checksum


def test_the_packaged_migrations_are_valid() -> None:
    migrations = load_migrations(files("ml_service") / "migrations")

    assert migrations[0].name == "create_embeddings"
