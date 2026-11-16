from pgvector.psycopg import register_vector
from psycopg import Connection
from psycopg.rows import TupleRow
from psycopg_pool import ConnectionPool

from ml_service.config import DatabaseSettings

Pool = ConnectionPool[Connection[TupleRow]]


def _configure(connection: Connection[TupleRow]) -> None:
    # register_vector runs a query; the pool wants new connections handed over idle.
    register_vector(connection)
    connection.commit()


def create_pool(settings: DatabaseSettings, application_name: str) -> Pool:
    # Size Postgres max_connections for pods * pool_max.
    return ConnectionPool(
        conninfo=str(settings.url),
        min_size=1,
        max_size=settings.pool_max,
        kwargs={"application_name": application_name},
        configure=_configure,
        open=False,
    )
