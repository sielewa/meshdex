import uuid
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
from uuid import UUID

import numpy as np
import pytest
from pgvector import Vector as PgVector

from ml_service.config import DatabaseSettings
from ml_service.database.pool import Pool, create_pool
from ml_service.embeddings.domain import ImageEmbedding, Vector, VersionEmbeddings
from ml_service.embeddings.embeddings_repository import EmbeddingsRepository

MODEL = "ViT-B-32/laion2b_s34b_b79k"
DIMENSIONS = 512


def _pool(url: str) -> Pool:
    settings = DatabaseSettings.model_validate({"url": url, "pool_max": 4})

    return create_pool(settings, application_name="ml-service-test")


@pytest.fixture
def pool(migrated_database_url: str) -> Iterator[Pool]:
    with _pool(migrated_database_url) as pool:
        yield pool


@pytest.fixture
def repository(pool: Pool) -> EmbeddingsRepository:
    return EmbeddingsRepository(pool)


def _vector(seed: int) -> Vector:
    vector = np.random.default_rng(seed).standard_normal(DIMENSIONS).astype(np.float32)

    return vector / np.linalg.norm(vector)


def _version(
    asset_id: UUID, number: int, names: tuple[str, ...] = ("a.webp",), seed: int = 0
) -> VersionEmbeddings:
    """Image keys contain the version id, like real ones (public/previews/<asset>/<version>.webp),
    so stored keys show which version the rows belong to."""
    version_id = uuid.uuid4()

    return VersionEmbeddings(
        asset_id=asset_id,
        asset_version_id=version_id,
        version_number=number,
        images=[
            ImageEmbedding(image_key=f"{version_id}/{name}", vector=_vector(seed + index))
            for index, name in enumerate(names)
        ],
    )


def _keys(version: VersionEmbeddings) -> list[str]:
    return sorted(image.image_key for image in version.images)


def _stored_rows(pool: Pool, asset_id: UUID) -> list[tuple[str, PgVector]]:
    with pool.connection() as connection:
        rows = connection.execute(
            "SELECT image_key, embedding FROM embeddings WHERE asset_id = %s ORDER BY image_key",
            (asset_id,),
        ).fetchall()

    return [(str(key), vector) for key, vector in rows]


def _stored_keys(pool: Pool, asset_id: UUID) -> list[str]:
    return [key for key, _ in _stored_rows(pool, asset_id)]


def test_stores_every_image_of_a_version(repository: EmbeddingsRepository, pool: Pool) -> None:
    version = _version(uuid.uuid4(), 1, names=("front.webp", "side.webp"))

    applied = repository.save_versions(MODEL, [version])

    assert applied == {version.asset_version_id}
    rows = _stored_rows(pool, version.asset_id)
    assert [key for key, _ in rows] == _keys(version)
    np.testing.assert_allclose(rows[0][1].to_numpy(), version.images[0].vector, rtol=1e-6)
    assert repository.find_embedded_version_ids(MODEL) == {version.asset_version_id}


def test_a_newer_version_replaces_the_previous_embeddings(
    repository: EmbeddingsRepository, pool: Pool
) -> None:
    asset_id = uuid.uuid4()
    first = _version(asset_id, 1, names=("old-1.webp", "old-2.webp"))
    second = _version(asset_id, 2, names=("new.webp",))
    repository.save_versions(MODEL, [first])

    applied = repository.save_versions(MODEL, [second])

    assert applied == {second.asset_version_id}
    assert _stored_keys(pool, asset_id) == _keys(second)
    assert repository.find_embedded_version_ids(MODEL) == {second.asset_version_id}


def test_an_older_version_is_ignored(repository: EmbeddingsRepository, pool: Pool) -> None:
    asset_id = uuid.uuid4()
    newer = _version(asset_id, 2)
    repository.save_versions(MODEL, [newer])

    applied = repository.save_versions(MODEL, [_version(asset_id, 1)])

    assert applied == set()
    assert _stored_keys(pool, asset_id) == _keys(newer)


def test_repeating_a_write_replaces_it_without_duplicates(
    repository: EmbeddingsRepository, pool: Pool
) -> None:
    version = _version(uuid.uuid4(), 1, names=("a.webp", "b.webp"))
    repository.save_versions(MODEL, [version])

    applied = repository.save_versions(MODEL, [version])

    assert applied == {version.asset_version_id}
    assert _stored_keys(pool, version.asset_id) == _keys(version)


def test_a_batch_with_two_versions_of_one_asset_keeps_the_newer(
    repository: EmbeddingsRepository, pool: Pool
) -> None:
    asset_id = uuid.uuid4()
    older, newer = _version(asset_id, 1), _version(asset_id, 3)

    applied = repository.save_versions(MODEL, [newer, older])

    assert applied == {newer.asset_version_id}
    assert _stored_keys(pool, asset_id) == _keys(newer)


def test_models_are_stored_separately(repository: EmbeddingsRepository) -> None:
    asset_id = uuid.uuid4()
    first, second = _version(asset_id, 1), _version(asset_id, 1)

    repository.save_versions(MODEL, [first])
    repository.save_versions("other-model", [second])

    assert repository.find_embedded_version_ids(MODEL) == {first.asset_version_id}
    assert repository.find_embedded_version_ids("other-model") == {second.asset_version_id}


def test_concurrent_writes_of_one_asset_end_with_the_newest_version(
    repository: EmbeddingsRepository, pool: Pool
) -> None:
    asset_id = uuid.uuid4()
    versions = [_version(asset_id, number, names=("a.webp", "b.webp")) for number in range(1, 9)]

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(lambda version: repository.save_versions(MODEL, [version]), versions))

    # Whatever the interleaving: only the newest version's rows, never a mix of two versions.
    assert _stored_keys(pool, asset_id) == _keys(versions[-1])
    assert repository.find_embedded_version_ids(MODEL) == {versions[-1].asset_version_id}


def test_search_ranks_assets_by_their_best_matching_image(
    repository: EmbeddingsRepository,
) -> None:
    query = _vector(1000)
    close, far = uuid.uuid4(), uuid.uuid4()
    # `close` has one image almost equal to the query and one unrelated image.
    near_query = (query + 0.05 * _vector(1)).astype(np.float32)
    close_version = VersionEmbeddings(
        asset_id=close,
        asset_version_id=uuid.uuid4(),
        version_number=1,
        images=[
            ImageEmbedding("near.webp", near_query / np.linalg.norm(near_query)),
            ImageEmbedding("other.webp", _vector(2)),
        ],
    )
    repository.save_versions(MODEL, [close_version, _version(far, 1, seed=3)])

    hits = repository.search(MODEL, query, limit=10)

    assert [hit.asset_id for hit in hits] == [close, far]
    expected = float(np.dot(query, close_version.images[0].vector))
    assert hits[0].score == pytest.approx(expected, abs=1e-5)


def test_search_through_the_hnsw_index_returns_more_than_its_default_40_rows(
    migrated_database_url: str,
) -> None:
    """An HNSW scan stops after hnsw.ef_search rows (default 40) whatever the LIMIT: the
    repository has to raise it for large limits.

    On a table this small the planner prefers other plans, and they return all rows, so the test
    would pass even without the fix. Disabling sequential scans, bitmap scans and sorts leaves the
    HNSW index as the only way to answer ORDER BY distance (checked with EXPLAIN).
    """
    planner_options = "-c enable_seqscan=off -c enable_bitmapscan=off -c enable_sort=off"
    # libpq `options`: every session of this pool starts with these settings.
    url = f"{migrated_database_url}?options={quote(planner_options)}"
    with _pool(url) as pool:
        repository = EmbeddingsRepository(pool)
        repository.save_versions(MODEL, [_version(uuid.uuid4(), 1, seed=i) for i in range(150)])

        hits = repository.search(MODEL, _vector(9999), limit=100)

    assert len(hits) == 100
    assert len({hit.asset_id for hit in hits}) == 100


def test_removing_an_embedded_version_removes_its_vectors(
    repository: EmbeddingsRepository, pool: Pool
) -> None:
    version = _version(uuid.uuid4(), 1, names=("a.webp", "b.webp"))
    repository.save_versions(MODEL, [version])

    with pool.connection() as connection:
        connection.execute(
            "DELETE FROM embedded_versions WHERE model = %s AND asset_id = %s",
            (MODEL, version.asset_id),
        )

    assert _stored_keys(pool, version.asset_id) == []


def test_vectors_are_stored_inside_rows_not_in_toast(
    repository: EmbeddingsRepository, pool: Pool
) -> None:
    """Guards migration 003's STORAGE PLAIN: a 512-d vector exceeds the TOAST threshold."""
    repository.save_versions(MODEL, [_version(uuid.uuid4(), 1, seed=i) for i in range(50)])

    with pool.connection() as connection:
        storage, toast_bytes = connection.execute(
            """
            SELECT attribute.attstorage, pg_relation_size(class.reltoastrelid)
            FROM pg_class AS class
            JOIN pg_attribute AS attribute ON attribute.attrelid = class.oid
            WHERE class.relname = 'embeddings' AND attribute.attname = 'embedding'
            """
        ).fetchone() or (None, None)

    assert storage == "p"
    assert toast_bytes == 0
