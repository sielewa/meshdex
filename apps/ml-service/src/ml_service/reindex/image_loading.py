"""The part of the reindex job that runs in DataLoader worker processes.

Each worker imports this module when it starts (spawn), so it imports only what loading needs:
no model code, no database driver.
"""

import io
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt
from PIL import Image
from torch.utils.data import Dataset

from ml_service.reindex.ports import ImageSource

# One image → uint8 array (height, width, 3); ClipModel.image_transform.
ImageTransform = Callable[[Image.Image], npt.NDArray[np.uint8]]


@dataclass(frozen=True, slots=True)
class LoadedImage:
    """One image as a worker produced it: pixels, or the reason there are none."""

    index: int
    pixels: npt.NDArray[np.uint8] | None
    error: str | None
    fetch_ms: float
    decode_ms: float
    preprocess_ms: float


@dataclass(slots=True)
class ImageBatch:
    """What the main process receives: the images that loaded, stacked, plus the failures.

    Built inside the worker (collate runs there), so stacking is parallel too. Pixels are a uint8
    numpy array, sent to the main process through the worker's pipe. Not a torch tensor: on
    macOS torch shares tensors between processes through shared-memory files, and a worker that
    sent one then doesn't exit when the DataLoader finishes, so its shutdown waits out a 5 s
    timeout per worker (measured, docs/data-processing.md). uint8 keeps the copy small: 9.6 MB
    for 64 images instead of 38.5 MB as float32.
    """

    pixels: npt.NDArray[np.uint8] | None
    # Dataset indexes of the rows of `pixels`, in order.
    indexes: list[int]
    failures: list[tuple[int, str]] = field(default_factory=list)
    # Summed over the batch's images; worker time, overlapping with the main process.
    fetch_ms: float = 0.0
    decode_ms: float = 0.0
    preprocess_ms: float = 0.0


class ImageDataset(Dataset[LoadedImage]):
    """Map-style dataset over object storage keys: fetch → decode → resize/crop to uint8.

    A failure becomes a value instead of an exception: an exception in a worker would stop the
    whole DataLoader, and one broken or missing image must not stop a reindex of the catalogue.
    The job reports every failure and exits non-zero.
    """

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
        except Exception as error:  # reported per image, see the class docstring
            return _failed(index, f"fetch: {error!r}", started)

        fetched = time.perf_counter()
        try:
            with Image.open(io.BytesIO(data)) as image:
                # Decoding is lazy in Pillow; load() forces it here so it is timed separately.
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
    """Module-level so worker processes can unpickle it by reference."""
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
