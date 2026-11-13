"""Postgres with pgvector in a container, one fresh database per test.

The image is the one from infra/docker/compose.yml, so tests run against the same Postgres and
pgvector versions as local development.
"""

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

# Ryuk (the container that removes test containers if the test process dies) gets the Docker
# socket mounted. Testcontainers mounts the client-side path by default, which on Docker Desktop
# for macOS is ~/.docker/run/docker.sock: a host path the Docker VM can't mount. Inside the VM, as
# in Colima and on Linux (CI), the daemon's socket is /var/run/docker.sock. An exported variable
# still wins.
os.environ.setdefault("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")


@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    # driver=None: plain postgresql:// URLs, which psycopg 3 understands.
    with PostgresContainer(POSTGRES_IMAGE, driver=None) as container:
        yield container


@pytest.fixture
def database_url(postgres: PostgresContainer) -> str:
    """A new empty database with the `vector` extension, as the infrastructure prepares it.

    One database per test instead of one shared: tests can't see each other's tables, and no
    cleanup is needed. Creating a database takes milliseconds, starting a container seconds.
    """
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
    """A fresh database with the service's migrations applied."""
    with psycopg.connect(database_url, autocommit=True) as connection:
        MigrationRunner(connection).run(load_migrations(files("ml_service") / "migrations"))

    return database_url


@pytest.fixture
def connection(database_url: str) -> Iterator[psycopg.Connection[tuple[object, ...]]]:
    with psycopg.connect(database_url, autocommit=True) as connection:
        yield connection
