"""Embeds every asset version that has an image and no embedding for the model yet (ADR 018).

catalogue (gRPC) → pending versions → DataLoader workers: fetch, decode, preprocess
→ CLIP on each batch (main process) → one write per batch (upsert + COPY).
"""

import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import torch
from torch.utils.data import DataLoader

from ml_service.clients.asset_service.domain import CatalogVersion
from ml_service.embeddings.clip_model import ClipModel
from ml_service.embeddings.domain import ImageEmbedding, VersionEmbeddings
from ml_service.reindex.image_loading import ImageBatch, ImageDataset, collate_images
from ml_service.reindex.ports import AssetCatalog, EmbeddingsStore, ImageSource

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ReindexOptions:
    batch_size: int = 64
    # 0 loads in the main process (no parallelism; useful as a baseline and in tests).
    num_workers: int = 4
    # Batches each worker keeps ready ahead of the model: the prefetch depth.
    prefetch_factor: int = 2
    limit: int | None = None
    # Also re-embed versions that already have embeddings for the model: after a change to
    # preprocessing that keeps the model's name, and for benchmarks that repeat the same work.
    include_embedded: bool = False
    # Seconds the main process waits for one batch before failing instead of hanging on a
    # stuck worker.
    batch_timeout_s: int = 300


@dataclass(frozen=True, slots=True)
class ReindexFailure:
    asset_id: UUID
    image_key: str
    reason: str


@dataclass(slots=True)
class ReindexTimings:
    """Milliseconds. Main-process stages add up to (almost) the total; worker stages are sums
    over all images and overlap with them. Where the main process waits shows the bottleneck:
    long `loader_wait` means loading can't keep up with the model; short means it can."""

    list_ms: float = 0.0
    # Until the first batch arrives: worker start-up (spawn, imports) plus one batch of work.
    first_batch_ms: float = 0.0
    loader_wait_ms: float = 0.0
    model_ms: float = 0.0
    write_ms: float = 0.0
    # The last call for a batch, which finds the loader exhausted and stops its workers.
    shutdown_ms: float = 0.0
    # From the end of the first batch's write to the end of the loop: the pipeline running with
    # workers started and prefetch filled, the throughput a much larger catalogue would see.
    steady_ms: float = 0.0
    total_ms: float = 0.0
    worker_fetch_ms: float = 0.0
    worker_decode_ms: float = 0.0
    worker_preprocess_ms: float = 0.0


@dataclass(slots=True)
class ReindexResult:
    model: str
    versions_listed: int = 0
    versions_already_embedded: int = 0
    versions_without_image: int = 0
    versions_selected: int = 0
    versions_embedded: int = 0
    # A newer version of the asset was stored while this one was being embedded.
    versions_superseded: int = 0
    images_selected: int = 0
    images_embedded: int = 0
    batches: int = 0
    # Images embedded by the model after the first batch, i.e. within `timings.steady_ms`.
    steady_images: int = 0
    failures: list[ReindexFailure] = field(default_factory=list)
    timings: ReindexTimings = field(default_factory=ReindexTimings)

    @property
    def images_per_second(self) -> float:
        seconds = self.timings.total_ms / 1000

        return self.images_embedded / seconds if seconds > 0 else 0.0

    @property
    def steady_images_per_second(self) -> float:
        """0 with a single batch: there is no steady state to measure."""
        seconds = self.timings.steady_ms / 1000

        return self.steady_images / seconds if seconds > 0 else 0.0


class ReindexService:
    # Progress is logged every this many batches.
    LOG_EVERY_BATCHES = 10

    def __init__(
        self,
        catalog: AssetCatalog,
        store: EmbeddingsStore,
        clip: ClipModel,
        images: ImageSource,
    ) -> None:
        self._catalog = catalog
        self._store = store
        self._clip = clip
        self._images = images

    def run(self, options: ReindexOptions) -> ReindexResult:
        started = time.perf_counter()
        result = ReindexResult(model=self._clip.name)
        selected = self._select(result, options)
        result.timings.list_ms = (time.perf_counter() - started) * 1000
        if selected:
            self._embed(selected, result, options)

        result.timings.total_ms = (time.perf_counter() - started) * 1000

        return result

    def _select(self, result: ReindexResult, options: ReindexOptions) -> list[CatalogVersion]:
        """The whole catalogue is listed before loading starts: hundreds of small rows, and the
        DataLoader then works on a known amount of work. Already embedded versions are found
        with one query, not one per version."""
        versions = list(self._catalog.list_current_versions())
        embedded = (
            set()
            if options.include_embedded
            else self._store.find_embedded_version_ids(self._clip.name)
        )
        result.versions_listed = len(versions)
        selected: list[CatalogVersion] = []
        for version in versions:
            if version.asset_version_id in embedded:
                result.versions_already_embedded += 1
            elif not version.image_keys:
                result.versions_without_image += 1
            else:
                selected.append(version)

        if options.limit is not None:
            selected = selected[: options.limit]

        result.versions_selected = len(selected)
        result.images_selected = sum(len(version.image_keys) for version in selected)

        return selected

    def _embed(
        self, versions: list[CatalogVersion], result: ReindexResult, options: ReindexOptions
    ) -> None:
        # One dataset item per image; each remembers its version.
        items = [
            (version_index, key)
            for version_index, version in enumerate(versions)
            for key in version.image_keys
        ]
        assembler = _VersionAssembler(versions)
        loader = self._loader([key for _, key in items], options)
        timings = result.timings
        batches: Iterator[ImageBatch] = iter(loader)

        loop_started = time.perf_counter()
        steady_started: float | None = None
        while True:
            waited = time.perf_counter()
            batch = next(batches, None)
            wait_ms = (time.perf_counter() - waited) * 1000
            if batch is None:
                timings.shutdown_ms = wait_ms
                break

            if result.batches == 0:
                timings.first_batch_ms = (time.perf_counter() - loop_started) * 1000
            else:
                timings.loader_wait_ms += wait_ms

            result.batches += 1
            timings.worker_fetch_ms += batch.fetch_ms
            timings.worker_decode_ms += batch.decode_ms
            timings.worker_preprocess_ms += batch.preprocess_ms

            model_started = time.perf_counter()
            # Includes normalisation on the device. embed_images ends with a copy to the CPU,
            # which waits for the GPU (mps/cuda): the measured time is the model's real time,
            # not just the launch of its kernels. from_numpy shares the array's memory.
            vectors = (
                self._clip.embed_images(torch.from_numpy(batch.pixels))
                if batch.pixels is not None
                else None
            )
            timings.model_ms += (time.perf_counter() - model_started) * 1000

            if steady_started is not None:
                result.steady_images += len(batch.indexes)

            for row, index in enumerate(batch.indexes):
                version_index, key = items[index]
                assert vectors is not None
                assembler.add_image(version_index, ImageEmbedding(key, vectors[row]))
            for index, reason in batch.failures:
                version_index, key = items[index]
                assembler.fail_image(version_index)
                result.failures.append(
                    ReindexFailure(versions[version_index].asset_id, key, reason)
                )
                logger.warning(
                    "Image failed to load",
                    extra={"asset_id": versions[version_index].asset_id, "key": key},
                )

            completed = assembler.take_completed()
            if completed:
                write_started = time.perf_counter()
                applied = self._store.save_versions(self._clip.name, completed)
                timings.write_ms += (time.perf_counter() - write_started) * 1000
                result.versions_embedded += len(applied)
                result.versions_superseded += len(completed) - len(applied)
                result.images_embedded += sum(
                    len(version.images)
                    for version in completed
                    if version.asset_version_id in applied
                )

            if steady_started is None:
                steady_started = time.perf_counter()

            if result.batches % self.LOG_EVERY_BATCHES == 0:
                logger.info(
                    "Reindex progress",
                    extra={
                        "images_embedded": result.images_embedded,
                        "images_selected": result.images_selected,
                    },
                )

        # Excludes the shutdown: a larger catalogue would pay it once too, like the start-up.
        if steady_started is not None and result.batches > 1:
            timings.steady_ms = (waited - steady_started) * 1000

    def _loader(self, keys: list[str], options: ReindexOptions) -> DataLoader[Any]:
        dataset = ImageDataset(keys, self._images, self._clip.image_transform)
        parallel = options.num_workers > 0

        return DataLoader(
            dataset,
            batch_size=options.batch_size,
            # In order: images of one version stay together, so a version is complete (and
            # written) at most one batch after its first image.
            shuffle=False,
            num_workers=options.num_workers,
            collate_fn=collate_images,
            prefetch_factor=options.prefetch_factor if parallel else None,
            # spawn on every platform: fork after torch has initialised a GPU (or its thread
            # pools) is unsafe, and macOS uses spawn anyway, so runs behave the same everywhere.
            multiprocessing_context="spawn" if parallel else None,
            timeout=options.batch_timeout_s if parallel else 0,
        )


class _VersionAssembler:
    """Collects image embeddings until every image of a version is accounted for.

    A version with a failed image is not written at all: partial embeddings would make the
    version look done, and the next reindex would skip it.
    """

    def __init__(self, versions: list[CatalogVersion]) -> None:
        self._versions = versions
        self._remaining = [len(version.image_keys) for version in versions]
        self._images: dict[int, list[ImageEmbedding]] = {}
        self._failed: set[int] = set()
        self._touched: set[int] = set()

    def add_image(self, version_index: int, image: ImageEmbedding) -> None:
        self._images.setdefault(version_index, []).append(image)
        self._account(version_index)

    def fail_image(self, version_index: int) -> None:
        self._failed.add(version_index)
        self._account(version_index)

    def take_completed(self) -> list[VersionEmbeddings]:
        done = sorted(index for index in self._touched if self._remaining[index] == 0)
        self._touched.difference_update(done)
        completed: list[VersionEmbeddings] = []
        for index in done:
            images = self._images.pop(index, [])
            if index in self._failed:
                continue

            version = self._versions[index]
            completed.append(
                VersionEmbeddings(
                    asset_id=version.asset_id,
                    asset_version_id=version.asset_version_id,
                    version_number=version.version_number,
                    images=images,
                )
            )

        return completed

    def _account(self, version_index: int) -> None:
        self._remaining[version_index] -= 1
        self._touched.add(version_index)
