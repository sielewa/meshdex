from collections.abc import Sequence
from uuid import UUID

from ml_service.database.pool import Pool
from ml_service.embeddings.domain import SearchHit, Vector, VersionEmbeddings

# `WHERE` keeps an older version from replacing a newer one; an equal one may, so retries are
# idempotent. RETURNING lists the assets that won.
_CLAIM_VERSIONS = """
    INSERT INTO embedded_versions AS stored (model, asset_id, asset_version_id, version_number)
    SELECT %(model)s, batch.asset_id, batch.asset_version_id, batch.version_number
    FROM unnest(%(asset_ids)s::uuid[], %(version_ids)s::uuid[], %(version_numbers)s::integer[])
        AS batch (asset_id, asset_version_id, version_number)
    ON CONFLICT (model, asset_id) DO UPDATE
    SET asset_version_id = EXCLUDED.asset_version_id,
        version_number = EXCLUDED.version_number,
        embedded_at = now()
    WHERE stored.version_number <= EXCLUDED.version_number
    RETURNING asset_id
"""

_DELETE_PREVIOUS = "DELETE FROM embeddings WHERE model = %s AND asset_id = ANY(%s)"

# Binary COPY: one statement per batch, vectors sent as raw float32.
_COPY_EMBEDDINGS = """
    COPY embeddings (model, asset_id, image_key, embedding) FROM STDIN WITH (FORMAT BINARY)
"""
_COPY_TYPES = ["text", "uuid", "text", "vector"]

# The inner query is the HNSW scan. It over-fetches because an asset with several images would
# otherwise take several places; the outer one keeps the best image per asset.
_SEARCH = """
    SELECT asset_id, max(1 - distance) AS score
    FROM (
        SELECT asset_id, embedding <=> %(query)s AS distance
        FROM embeddings
        WHERE model = %(model)s
        ORDER BY embedding <=> %(query)s
        LIMIT %(candidates)s
    ) AS nearest
    GROUP BY asset_id
    ORDER BY score DESC, asset_id
    LIMIT %(limit)s
"""


class EmbeddingsRepository:
    CANDIDATES_PER_HIT = 4
    # An HNSW scan returns at most `hnsw.ef_search` rows whatever the LIMIT (pgvector: default
    # 40, max 1000), so it is raised per query to cover the candidates.
    MIN_EF_SEARCH = 40
    MAX_EF_SEARCH = 1000

    def __init__(self, pool: Pool) -> None:
        self._pool = pool

    def save_versions(self, model: str, versions: Sequence[VersionEmbeddings]) -> set[UUID]:
        """Returns the ids of the versions applied; older than the stored one are skipped."""
        newest = _newest_per_asset(versions)
        if not newest:
            return set()

        with self._pool.connection() as connection, connection.transaction():
            rows = connection.execute(
                _CLAIM_VERSIONS,
                {
                    "model": model,
                    "asset_ids": [version.asset_id for version in newest],
                    "version_ids": [version.asset_version_id for version in newest],
                    "version_numbers": [version.version_number for version in newest],
                },
            ).fetchall()
            claimed = {asset_id for (asset_id,) in rows}
            applied = [version for version in newest if version.asset_id in claimed]
            if not applied:
                return set()

            connection.execute(_DELETE_PREVIOUS, (model, [version.asset_id for version in applied]))
            with connection.cursor().copy(_COPY_EMBEDDINGS) as copy:
                copy.set_types(_COPY_TYPES)
                for version in applied:
                    for image in version.images:
                        copy.write_row((model, version.asset_id, image.image_key, image.vector))

        return {version.asset_version_id for version in applied}

    def find_embedded_version_ids(self, model: str) -> set[UUID]:
        with self._pool.connection() as connection:
            rows = connection.execute(
                "SELECT asset_version_id FROM embedded_versions WHERE model = %s", (model,)
            ).fetchall()

        return {asset_version_id for (asset_version_id,) in rows}

    def search(self, model: str, query: Vector, limit: int) -> list[SearchHit]:
        candidates = limit * self.CANDIDATES_PER_HIT
        ef_search = min(max(candidates, self.MIN_EF_SEARCH), self.MAX_EF_SEARCH)
        with self._pool.connection() as connection, connection.transaction():
            # is_local: the setting ends with the transaction, not with the pooled connection.
            connection.execute("SELECT set_config('hnsw.ef_search', %s, true)", (str(ef_search),))
            rows = connection.execute(
                _SEARCH,
                {
                    "query": query,
                    "model": model,
                    "candidates": candidates,
                    "limit": limit,
                },
            ).fetchall()

        return [SearchHit(asset_id=asset_id, score=float(score)) for asset_id, score in rows]


def _newest_per_asset(versions: Sequence[VersionEmbeddings]) -> list[VersionEmbeddings]:
    """One per asset because `ON CONFLICT DO UPDATE` can't touch a row twice in one statement;
    sorted so concurrent batches lock rows in one order and can't deadlock."""
    newest: dict[UUID, VersionEmbeddings] = {}
    for version in versions:
        stored = newest.get(version.asset_id)
        if stored is None or version.version_number > stored.version_number:
            newest[version.asset_id] = version

    return [newest[asset_id] for asset_id in sorted(newest)]
