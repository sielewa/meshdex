"""ReindexService with in-memory catalogue, storage and embeddings store, and the random CLIP model.

Most tests load in the main process (num_workers=0); one runs real spawned workers, which is what
proves that everything sent to them pickles.
"""

import io
from collections.abc import Iterator, Sequence
from types import SimpleNamespace
from uuid import UUID, uuid4

import numpy as np
import torch
from PIL import Image

from ml_service.clients.asset_service.domain import CatalogVersion
from ml_service.embeddings.clip_model import ClipModel
from ml_service.embeddings.domain import VersionEmbeddings
from ml_service.reindex.reindex_service import ReindexOptions, ReindexService

IN_PROCESS = ReindexOptions(batch_size=2, num_workers=0)


def _png(color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(buffer, format="PNG")

    return buffer.getvalue()


def _version(*image_keys: str, number: int = 1) -> CatalogVersion:
    return CatalogVersion(
        asset_id=uuid4(),
        asset_version_id=uuid4(),
        version_number=number,
        image_keys=image_keys,
    )


class _Catalog:
    def __init__(self, versions: Sequence[CatalogVersion]) -> None:
        self._versions = versions

    def list_current_versions(self) -> Iterator[CatalogVersion]:
        yield from self._versions


class _Store:
    """Records every write; versions in `superseded` are rejected as the version guard would."""

    def __init__(self, embedded: set[UUID] | None = None, superseded: set[UUID] | None = None):
        self.embedded = embedded or set()
        self.superseded = superseded or set()
        self.writes: list[list[VersionEmbeddings]] = []

    def find_embedded_version_ids(self, model: str) -> set[UUID]:
        return set(self.embedded)

    def save_versions(self, model: str, versions: Sequence[VersionEmbeddings]) -> set[UUID]:
        self.writes.append(list(versions))

        return {v.asset_version_id for v in versions if v.asset_version_id not in self.superseded}

    @property
    def saved(self) -> dict[UUID, VersionEmbeddings]:
        return {version.asset_version_id: version for write in self.writes for version in write}


class _Images:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self._objects = objects

    def get_bytes(self, key: str) -> bytes:
        return self._objects[key]


def _images(*keys: str) -> _Images:
    return _Images({key: _png((index * 40 % 256, 80, 120)) for index, key in enumerate(keys)})


def test_embeds_only_versions_with_an_image_and_no_embedding(clip: ClipModel) -> None:
    done, without_image, pending = _version("done.png"), _version(), _version("pending.png")
    store = _Store(embedded={done.asset_version_id})
    service = ReindexService(
        _Catalog([done, without_image, pending]), store, clip, _images("done.png", "pending.png")
    )

    result = service.run(IN_PROCESS)

    assert result.versions_listed == 3
    assert result.versions_already_embedded == 1
    assert result.versions_without_image == 1
    assert result.versions_embedded == 1
    assert result.images_embedded == 1
    assert result.failures == []
    assert list(store.saved) == [pending.asset_version_id]
    saved = store.saved[pending.asset_version_id]
    assert saved.asset_id == pending.asset_id
    assert saved.version_number == pending.version_number
    assert [image.image_key for image in saved.images] == ["pending.png"]
    assert saved.images[0].vector.shape == (clip.dimensions,)


def test_stored_vectors_are_the_models_embeddings_of_the_images(clip: ClipModel) -> None:
    version = _version("a.png")
    images = _images("a.png")
    store = _Store()

    ReindexService(_Catalog([version]), store, clip, images).run(IN_PROCESS)

    with Image.open(io.BytesIO(images.get_bytes("a.png"))) as image:
        pixels = np.stack([clip.image_transform(image)])
    expected = clip.embed_images(torch.from_numpy(pixels))

    # Batch of one vs the job's batch of two: same maths, float rounding may differ.
    np.testing.assert_allclose(
        store.saved[version.asset_version_id].images[0].vector, expected[0], atol=1e-5
    )


def test_writes_once_per_batch(clip: ClipModel) -> None:
    versions = [_version(f"{index}.png") for index in range(5)]
    store = _Store()

    result = ReindexService(
        _Catalog(versions), store, clip, _images(*(f"{index}.png" for index in range(5)))
    ).run(IN_PROCESS)

    assert result.batches == 3
    assert [len(write) for write in store.writes] == [2, 2, 1]


def test_a_version_whose_images_span_two_batches_is_written_once_complete(
    clip: ClipModel,
) -> None:
    first, spanning = _version("a.png"), _version("b.png", "c.png")
    store = _Store()

    ReindexService(
        _Catalog([first, spanning]), store, clip, _images("a.png", "b.png", "c.png")
    ).run(IN_PROCESS)

    assert [[v.asset_version_id for v in write] for write in store.writes] == [
        [first.asset_version_id],
        [spanning.asset_version_id],
    ]
    assert [i.image_key for i in store.saved[spanning.asset_version_id].images] == [
        "b.png",
        "c.png",
    ]


def test_a_version_with_a_broken_image_is_reported_and_not_written(clip: ClipModel) -> None:
    """Partial embeddings would make the version look done and the next run would skip it."""
    healthy, broken = _version("ok.png"), _version("ok-too.png", "missing.png")
    store = _Store()

    result = ReindexService(
        _Catalog([healthy, broken]), store, clip, _images("ok.png", "ok-too.png")
    ).run(IN_PROCESS)

    assert list(store.saved) == [healthy.asset_version_id]
    assert result.versions_embedded == 1
    assert [(f.asset_id, f.image_key) for f in result.failures] == [
        (broken.asset_id, "missing.png")
    ]
    assert result.failures[0].reason.startswith("fetch: ")


def test_a_version_superseded_during_the_run_is_counted_not_embedded(clip: ClipModel) -> None:
    current, superseded = _version("a.png"), _version("b.png")
    store = _Store(superseded={superseded.asset_version_id})

    result = ReindexService(
        _Catalog([current, superseded]), store, clip, _images("a.png", "b.png")
    ).run(IN_PROCESS)

    assert result.versions_embedded == 1
    assert result.versions_superseded == 1
    assert result.images_embedded == 1


def test_limit_caps_the_number_of_versions(clip: ClipModel) -> None:
    versions = [_version(f"{index}.png") for index in range(4)]
    store = _Store()

    result = ReindexService(
        _Catalog(versions), store, clip, _images(*(f"{index}.png" for index in range(4)))
    ).run(ReindexOptions(batch_size=2, num_workers=0, limit=3))

    assert result.versions_selected == 3
    assert list(store.saved) == [version.asset_version_id for version in versions[:3]]


def test_nothing_pending_does_no_work(clip: ClipModel) -> None:
    version = _version("a.png")
    store = _Store(embedded={version.asset_version_id})

    result = ReindexService(_Catalog([version]), store, clip, _images()).run(IN_PROCESS)

    assert result.batches == 0
    assert store.writes == []


def test_spawned_workers_load_the_same_embeddings_as_the_main_process(clip: ClipModel) -> None:
    """Real worker processes: the dataset, storage adapter and transform must pickle.

    The image source is a SimpleNamespace over a dict's bound `__getitem__`: both pickle by
    reference to builtins, while a class defined in this test file could not be imported by a
    spawned worker (pytest's importlib mode doesn't put tests on sys.path).
    """
    keys = [f"{index}.png" for index in range(5)]
    versions = [_version(key) for key in keys]
    objects = {key: _png((index * 50, 10, 200)) for index, key in enumerate(keys)}
    in_main, in_workers = _Store(), _Store()

    ReindexService(_Catalog(versions), in_main, clip, _Images(objects)).run(IN_PROCESS)
    result = ReindexService(
        _Catalog(versions), in_workers, clip, SimpleNamespace(get_bytes=objects.__getitem__)
    ).run(ReindexOptions(batch_size=2, num_workers=2, prefetch_factor=1, batch_timeout_s=60))

    assert result.versions_embedded == 5
    for version in versions:
        np.testing.assert_allclose(
            in_workers.saved[version.asset_version_id].images[0].vector,
            in_main.saved[version.asset_version_id].images[0].vector,
            atol=1e-6,
        )
