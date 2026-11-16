"""Runs in DataLoader workers, which import it on spawn: no model or database imports here."""

import io
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt
from PIL import Image
from torch.utils.data import Dataset

from ml_service.reindex.ports import ImageSource

ImageTransform = Callable[[Image.Image], npt.NDArray[np.uint8]]


@dataclass(frozen=True, slots=True)
class LoadedImage:
    index: int
    pixels: npt.NDArray[np.uint8] | None
    error: str | None
    fetch_ms: float
    decode_ms: float
    preprocess_ms: float


@dataclass(slots=True)
class ImageBatch:
    """Pixels are uint8 numpy, not a torch tensor: on macOS a worker that sent a shared-memory
    tensor doesn't exit and shutdown waits out a 5 s timeout per worker. uint8 is also a quarter
    of float32 to copy (docs/data-processing.md)."""

    pixels: npt.NDArray[np.uint8] | None
    # Dataset index of each row of `pixels`.
    indexes: list[int]
    failures: list[tuple[int, str]] = field(default_factory=list)
    fetch_ms: float = 0.0
    decode_ms: float = 0.0
    preprocess_ms: float = 0.0


class ImageDataset(Dataset[LoadedImage]):
    """A failed image is returned as a value: an exception in a worker would stop the whole
    DataLoader over one broken image. The job reports failures and exits non-zero."""

    def __init__(self, keys: Sequence[str], source: ImageSource, transform: ImageTransform) -> None:
        self._keys = list(keys)
        self._source = source
        self._transform = transform

    def __len__(self) -> int:
        return len(self._keys)

    def __getitem__(self, index: int) -> LoadedImage:
        started = time.perf_counter()
        try:
            data = self._source.get_bytes(self._keys[index])
        except Exception as error:
            return _failed(index, f"fetch: {error!r}", started)

        fetched = time.perf_counter()
        try:
            with Image.open(io.BytesIO(data)) as image:
                # Pillow decodes lazily; load() forces it so decoding is timed on its own.
                image.load()
                decoded = time.perf_counter()
                pixels = self._transform(image)
        except Exception as error:
            return _failed(index, f"decode: {error!r}", started)

        done = time.perf_counter()

        return LoadedImage(
            index=index,
            pixels=pixels,
            error=None,
            fetch_ms=(fetched - started) * 1000,
            decode_ms=(decoded - fetched) * 1000,
            preprocess_ms=(done - decoded) * 1000,
        )


def collate_images(items: list[LoadedImage]) -> ImageBatch:
    # Module-level so workers can unpickle it.
    arrays = [item.pixels for item in items if item.pixels is not None]
    loaded = [item for item in items if item.pixels is not None]

    return ImageBatch(
        pixels=np.stack(arrays) if arrays else None,
        indexes=[item.index for item in loaded],
        failures=[(item.index, item.error or "unknown") for item in items if item.pixels is None],
        fetch_ms=sum(item.fetch_ms for item in items),
        decode_ms=sum(item.decode_ms for item in items),
        preprocess_ms=sum(item.preprocess_ms for item in items),
    )


def _failed(index: int, error: str, started: float) -> LoadedImage:
    return LoadedImage(
        index=index,
        pixels=None,
        error=error,
        fetch_ms=(time.perf_counter() - started) * 1000,
        decode_ms=0.0,
        preprocess_ms=0.0,
    )
