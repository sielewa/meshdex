"""Command-line entry point: `python -m ml_service <command>`.

Each command loads only the settings it needs and fails before doing any work if they are invalid.
"""

import argparse
import logging
import sys
from collections.abc import Sequence
from importlib.resources import files

import psycopg

from ml_service.config import DatabaseSettings, LoggingSettings
from ml_service.database.migration_runner import MigrationRunner, load_migrations
from ml_service.logs import configure_logging

logger = logging.getLogger("ml_service")


def _migrate() -> int:
    settings = DatabaseSettings()
    migrations = load_migrations(files("ml_service") / "migrations")
    with psycopg.connect(
        str(settings.url), autocommit=True, application_name="ml-service-migrate"
    ) as connection:
        MigrationRunner(connection).run(migrations)

    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ml_service")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("migrate", help="apply pending database migrations")
    args = parser.parse_args(argv)

    configure_logging(LoggingSettings())
    if args.command == "migrate":
        return _migrate()

    parser.error(f"unknown command {args.command!r}")


if __name__ == "__main__":
    sys.exit(main())
