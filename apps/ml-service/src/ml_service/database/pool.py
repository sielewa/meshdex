"""The service's connection pool: one per process, a fixed budget of database connections."""

from pgvector.psycopg import register_vector
from psycopg import Connection
from psycopg.rows import TupleRow
from psycopg_pool import ConnectionPool

from ml_service.config import DatabaseSettings

Pool = ConnectionPool[Connection[TupleRow]]


def _configure(connection: Connection[TupleRow]) -> None:
    # Teaches the connection the `vector` type (numpy arrays in). It looks the type up with a
    # query, and the pool requires new connections to be handed over idle, hence the commit.
    register_vector(connection)
    connection.commit()


def create_pool(settings: DatabaseSettings, application_name: str) -> Pool:
    """Returns a closed pool; open it with `with create_pool(...) as pool:`.

    `max_size` is this process's share of the database's connection limit: total connections =
    pods * pool_max, which is what to size Postgres `max_connections` against.
    """
    return ConnectionPool(
        conninfo=str(settings.url),
        min_size=1,
        max_size=settings.pool_max,
        kwargs={"application_name": application_name},
        configure=_configure,
        open=False,
    )
