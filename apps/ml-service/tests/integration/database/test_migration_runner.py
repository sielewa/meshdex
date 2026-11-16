from concurrent.futures import ThreadPoolExecutor
from importlib.resources import files

import psycopg
import pytest

from ml_service.database.migration_runner import (
    Migration,
    MigrationChecksumMismatchError,
    MigrationRunner,
    load_migrations,
)

Connection = psycopg.Connection[tuple[object, ...]]


def _tables(connection: Connection) -> set[str]:
    rows = connection.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    ).fetchall()

    return {str(name) for (name,) in rows}


def test_applies_the_packaged_migrations_to_an_empty_database(connection: Connection) -> None:
    migrations = load_migrations(files("ml_service") / "migrations")

    applied = MigrationRunner(connection).run(migrations)

    assert applied == migrations
    assert {"schema_migrations", "embeddings"} <= _tables(connection)
    recorded = connection.execute(
        "SELECT version, name, checksum FROM schema_migrations"
    ).fetchall()
    assert recorded == [(m.version, m.name, m.checksum) for m in migrations]


def test_applies_nothing_when_the_schema_is_up_to_date(connection: Connection) -> None:
    migrations = [Migration(version=1, name="create_a", sql="CREATE TABLE a (id int);")]
    MigrationRunner(connection).run(migrations)

    applied = MigrationRunner(connection).run(migrations)

    assert applied == []


def test_applies_only_new_migrations(connection: Connection) -> None:
    first = Migration(version=1, name="create_a", sql="CREATE TABLE a (id int);")
    second = Migration(version=2, name="create_b", sql="CREATE TABLE b (id int);")
    MigrationRunner(connection).run([first])

    applied = MigrationRunner(connection).run([first, second])

    assert applied == [second]
    assert {"a", "b"} <= _tables(connection)


def test_rolls_back_a_failing_migration_with_its_history_row(connection: Connection) -> None:
    good = Migration(version=1, name="create_a", sql="CREATE TABLE a (id int);")
    # The first statement succeeds, the second fails: the table must not survive.
    bad = Migration(version=2, name="broken", sql="CREATE TABLE b (id int); SELECT * FROM nope;")

    with pytest.raises(psycopg.errors.UndefinedTable):
        MigrationRunner(connection).run([good, bad])

    assert "b" not in _tables(connection)
    versions = connection.execute("SELECT version FROM schema_migrations").fetchall()
    assert versions == [(1,)]


def test_refuses_to_run_when_an_applied_migration_was_edited(connection: Connection) -> None:
    MigrationRunner(connection).run(
        [Migration(version=1, name="a", sql="CREATE TABLE a (id int);")]
    )
    edited = Migration(version=1, name="a", sql="CREATE TABLE a (id bigint);")

    with pytest.raises(MigrationChecksumMismatchError, match=r"001_a\.sql"):
        MigrationRunner(connection).run([edited])


def test_tolerates_migrations_applied_by_a_newer_release(connection: Connection) -> None:
    first = Migration(version=1, name="create_a", sql="CREATE TABLE a (id int);")
    second = Migration(version=2, name="create_b", sql="CREATE TABLE b (id int);")
    MigrationRunner(connection).run([first, second])

    applied = MigrationRunner(connection).run([first])

    assert applied == []


def test_concurrent_runners_apply_each_migration_once(database_url: str) -> None:
    # pg_sleep keeps the first runner inside the lock long enough for the others to queue up.
    migrations = [
        Migration(version=1, name="slow", sql="SELECT pg_sleep(0.3); CREATE TABLE a (id int);")
    ]

    def run() -> list[Migration]:
        with psycopg.connect(database_url, autocommit=True) as connection:
            return MigrationRunner(connection).run(migrations)

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(lambda _: run(), range(3)))

    assert sorted(len(applied) for applied in results) == [0, 0, 1]


def test_requires_an_autocommit_connection(database_url: str) -> None:
    with (
        psycopg.connect(database_url) as connection,
        pytest.raises(ValueError, match="autocommit"),
    ):
        MigrationRunner(connection)
