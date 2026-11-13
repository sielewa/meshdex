"""Command-line entry point: `python -m ml_service <command>`.

Each command loads only the settings it needs and fails before doing any work if they are invalid.

Commands import their dependencies inside their function: DataLoader workers start with spawn,
which re-imports this module in every worker, so a top-level import of the model or database code
would be paid once per worker.
"""

import argparse
import logging
import os
import sys
from collections.abc import Sequence
from pathlib import Path

# gRPC's fork support re-arms its pollers in a forked child, and logs "FD from fork parent" for
# every DataLoader worker the reindex job starts. Workers are spawned (fork + exec, a fresh
# interpreter that never touches the parent's channel), so there is nothing to re-arm. Read when
# grpc is first imported, hence set before any command runs; an exported value still wins.
os.environ.setdefault("GRPC_ENABLE_FORK_SUPPORT", "false")

from ml_service.config import LoggingSettings
from ml_service.logs import configure_logging

logger = logging.getLogger("ml_service")


def _migrate() -> int:
    from importlib.resources import files

    import psycopg

    from ml_service.config import DatabaseSettings
    from ml_service.database.migration_runner import MigrationRunner, load_migrations

    settings = DatabaseSettings()
    migrations = load_migrations(files("ml_service") / "migrations")
    with psycopg.connect(
        str(settings.url), autocommit=True, application_name="ml-service-migrate"
    ) as connection:
        MigrationRunner(connection).run(migrations)

    return 0


def _reindex(args: argparse.Namespace) -> int:
    from datetime import UTC, datetime

    from ml_service.clients.asset_service.asset_service_client import (
        AssetServiceClient,
        create_channel,
    )
    from ml_service.config import AssetServiceSettings, ClipSettings, DatabaseSettings, S3Settings
    from ml_service.database.pool import create_pool
    from ml_service.embeddings.clip_model import load_clip_model
    from ml_service.embeddings.embeddings_repository import EmbeddingsRepository
    from ml_service.reindex.reindex_service import ReindexOptions, ReindexService
    from ml_service.reindex.run_record import build_run_record, write_run_record
    from ml_service.storage.s3_object_storage import S3ObjectStorage

    # Every setting is validated before the model loads or anything connects.
    database_settings = DatabaseSettings()
    clip_settings = ClipSettings()
    asset_service_settings = AssetServiceSettings()
    s3_settings = S3Settings()
    options = ReindexOptions(
        batch_size=args.batch_size,
        num_workers=args.num_workers,
        prefetch_factor=args.prefetch_factor,
        limit=args.limit,
    )

    started_at = datetime.now(UTC)
    clip = load_clip_model(clip_settings)
    with (
        create_pool(database_settings, application_name="ml-service-reindex") as pool,
        create_channel(asset_service_settings) as channel,
    ):
        service = ReindexService(
            catalog=AssetServiceClient(channel),
            store=EmbeddingsRepository(pool),
            clip=clip,
            images=S3ObjectStorage(s3_settings),
        )
        result = service.run(options)

    timings = result.timings
    logger.info(
        "Reindex finished",
        extra={
            "model": result.model,
            "versions_listed": result.versions_listed,
            "versions_already_embedded": result.versions_already_embedded,
            "versions_without_image": result.versions_without_image,
            "versions_embedded": result.versions_embedded,
            "images_embedded": result.images_embedded,
            "failures": len(result.failures),
            "total_ms": round(timings.total_ms),
            "first_batch_ms": round(timings.first_batch_ms),
            "loader_wait_ms": round(timings.loader_wait_ms),
            "model_ms": round(timings.model_ms),
            "write_ms": round(timings.write_ms),
            "images_per_second": round(result.images_per_second, 1),
        },
    )
    if args.record is not None:
        record = build_run_record(
            label=args.label,
            started_at=started_at,
            options=options,
            device=clip_settings.device,
            result=result,
        )
        logger.info("Run recorded", extra={"path": write_run_record(record, args.record)})

    # Non-zero so a Kubernetes Job (or a script) sees that some versions are still missing; a
    # rerun only picks up what is not embedded yet.
    return 1 if result.failures else 0


def _positive(value: str) -> int:
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be at least 1")

    return number


def _non_negative(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be at least 0")

    return number


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m ml_service")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("migrate", help="apply pending database migrations")
    reindex = commands.add_parser(
        "reindex", help="embed every asset version that has no embedding for the model yet"
    )
    reindex.add_argument("--batch-size", type=_positive, default=64)
    reindex.add_argument(
        "--num-workers",
        type=_non_negative,
        default=4,
        help="DataLoader worker processes; 0 loads in the main process",
    )
    reindex.add_argument(
        "--prefetch-factor", type=_positive, default=2, help="batches prefetched per worker"
    )
    reindex.add_argument("--limit", type=_positive, default=None, help="at most this many versions")
    reindex.add_argument(
        "--record", type=Path, default=None, help="directory to write the run record to (ADR 014)"
    )
    reindex.add_argument("--label", default=None, help="label stored in the run record")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)

    configure_logging(LoggingSettings())
    if args.command == "migrate":
        return _migrate()
    if args.command == "reindex":
        return _reindex(args)

    parser.error(f"unknown command {args.command!r}")


if __name__ == "__main__":
    sys.exit(main())
