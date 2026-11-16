import os
import uuid
from collections.abc import Iterator
from importlib.resources import files

import psycopg
import pytest
from psycopg import sql
from testcontainers.community.postgres import PostgresContainer

from ml_service.database.migration_runner import MigrationRunner, load_migrations

POSTGRES_IMAGE = "pgvector/pgvector:0.8.7-pg18-trixie"

# Ryuk mounts the Docker socket; the default client-side path on Docker Desktop for macOS isn't
# mountable from the VM, where the daemon's socket is /var/run/docker.sock.
os.environ.setdefault("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")


@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    with PostgresContainer(POSTGRES_IMAGE, driver=None) as container:
        yield container


@pytest.fixture
def database_url(postgres: PostgresContainer) -> str:
    # One database per test: isolation without cleanup, in milliseconds.
    admin_url: str = postgres.get_connection_url()
    name = f"test_{uuid.uuid4().hex}"
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))

    url = admin_url.rsplit("/", 1)[0] + f"/{name}"
    with psycopg.connect(url, autocommit=True) as connection:
        connection.execute("CREATE EXTENSION vector")

    return url


@pytest.fixture
def migrated_database_url(database_url: str) -> str:
    with psycopg.connect(database_url, autocommit=True) as connection:
        MigrationRunner(connection).run(load_migrations(files("ml_service") / "migrations"))

    return database_url


@pytest.fixture
def connection(database_url: str) -> Iterator[psycopg.Connection[tuple[object, ...]]]:
    with psycopg.connect(database_url, autocommit=True) as connection:
        yield connection
