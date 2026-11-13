"""Applies numbered SQL migrations in order, each exactly once (ADR 018).

A migration is `NNN_name.sql` in `ml_service/migrations/`, shipped inside the package so the runner
finds it from any working directory and in the container image. Applied migrations are recorded in
`schema_migrations` with a checksum of their SQL: editing a migration that already ran is an error,
because databases that applied the old text would silently differ from new ones.
"""

import hashlib
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from importlib.resources.abc import Traversable
from typing import Any

import psycopg

MIGRATION_FILE_PATTERN = re.compile(r"^(?P<version>\d{3})_(?P<name>[a-z0-9_]+)\.sql$")

# Key of the Postgres advisory lock held while migrating. Any constant works as long as every
# ml-service process uses the same one; advisory locks are scoped to one database, so it can't
# collide with another service's locks.
MIGRATION_LOCK_KEY = 0x6D6C5F6D69677261  # "ml_migra" in ASCII

logger = logging.getLogger(__name__)


class InvalidMigrationsError(Exception):
    """The migration files themselves are wrong (bad name, gap, duplicate)."""


class MigrationChecksumMismatchError(Exception):
    """A migration that already ran in this database was changed afterwards."""


@dataclass(frozen=True, slots=True)
class Migration:
    version: int
    name: str
    sql: str

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.sql.encode("utf-8")).hexdigest()


def load_migrations(directory: Traversable) -> list[Migration]:
    """Reads `NNN_name.sql` files; versions must run 1..n without gaps or duplicates.

    Gaps are rejected because they usually mean two branches picked numbers independently, and
    the order the migrations would run in was never reviewed.
    """
    migrations: list[Migration] = []
    for entry in directory.iterdir():
        if not entry.is_file() or not entry.name.endswith(".sql"):
            continue

        match = MIGRATION_FILE_PATTERN.match(entry.name)
        if match is None:
            raise InvalidMigrationsError(
                f"Migration file {entry.name!r} doesn't match NNN_name.sql (lowercase name)"
            )

        migrations.append(
            Migration(
                version=int(match["version"]),
                name=match["name"],
                sql=entry.read_text(encoding="utf-8"),
            )
        )

    migrations.sort(key=lambda migration: migration.version)
    versions = [migration.version for migration in migrations]
    if versions != list(range(1, len(migrations) + 1)):
        raise InvalidMigrationsError(
            f"Migration versions must be 1..n without gaps or duplicates, found {versions}"
        )

    return migrations


class MigrationRunner:
    """Brings the database schema up to date.

    Safe to start from several pods at once: a session-level advisory lock lets one runner work
    while the others wait, and they then find nothing left to apply. Each migration runs in its own
    transaction together with its `schema_migrations` row, so a failed migration leaves no trace
    and is retried on the next run. Consequence: statements that can't run in a transaction
    (`CREATE INDEX CONCURRENTLY`) aren't supported.
    """

    def __init__(self, connection: psycopg.Connection[Any]) -> None:
        # In autocommit mode `transaction()` opens a real transaction per migration; otherwise the
        # first statement would open an outer one and every migration would become a savepoint.
        if not connection.autocommit:
            raise ValueError("MigrationRunner needs a connection in autocommit mode")

        self._connection = connection

    def run(self, migrations: Sequence[Migration]) -> list[Migration]:
        """Applies pending migrations; returns them (empty when the schema is up to date)."""
        self._connection.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_KEY,))
        try:
            self._create_history_table()
            applied = self._applied_checksums()
            self._verify_applied(migrations, applied)
            pending = [migration for migration in migrations if migration.version not in applied]
            for migration in pending:
                self._apply(migration)
        finally:
            self._connection.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_KEY,))

        if not pending:
            logger.info("Database schema is up to date", extra={"version": len(migrations)})

        return pending

    def _create_history_table(self) -> None:
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version integer PRIMARY KEY,
                name text NOT NULL,
                checksum text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )

    def _applied_checksums(self) -> dict[int, str]:
        rows = self._connection.execute(
            "SELECT version, checksum FROM schema_migrations"
        ).fetchall()

        return {version: checksum for version, checksum in rows}

    def _verify_applied(self, migrations: Sequence[Migration], applied: dict[int, str]) -> None:
        known = {migration.version: migration for migration in migrations}
        for version, checksum in sorted(applied.items()):
            migration = known.get(version)
            if migration is None:
                # Applied by a newer release (e.g. an old pod restarting during a rolling update):
                # newer migrations are expected to stay compatible with the previous release.
                logger.warning(
                    "Database has a migration this release doesn't know", extra={"version": version}
                )
                continue

            if migration.checksum != checksum:
                raise MigrationChecksumMismatchError(
                    f"Migration {version:03d}_{migration.name}.sql changed after it was applied; "
                    "add a new migration instead of editing an applied one"
                )

    def _apply(self, migration: Migration) -> None:
        with self._connection.transaction():
            # Executed without parameters, so psycopg sends the file as one simple query and
            # Postgres runs all its statements.
            self._connection.execute(migration.sql.encode("utf-8"))
            self._connection.execute(
                "INSERT INTO schema_migrations (version, name, checksum) VALUES (%s, %s, %s)",
                (migration.version, migration.name, migration.checksum),
            )

        logger.info(
            "Applied migration", extra={"version": migration.version, "migration": migration.name}
        )
