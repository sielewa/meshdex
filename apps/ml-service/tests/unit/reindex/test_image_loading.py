"""ImageDataset and collate_images: what runs inside DataLoader workers."""

import io
import pickle

import numpy as np
import pytest
from PIL import Image

from ml_service.embeddings.clip_model import ClipModel
from ml_service.reindex.image_loading import ImageDataset, collate_images


def _png(color: tuple[int, int, int], size: tuple[int, int] = (64, 48)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")

    return buffer.getvalue()


class _DictSource:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self._objects = objects

    def get_bytes(self, key: str) -> bytes:
        return self._objects[key]


def test_loads_an_image_into_uint8_pixels(clip: ClipModel) -> None:
    dataset = ImageDataset(
        ["a.png"], _DictSource({"a.png": _png((200, 30, 30))}), clip.image_transform
    )

    item = dataset[0]

    assert item.error is None
    assert item.pixels is not None
    assert item.pixels.shape == (224, 224, 3)
    assert item.pixels.dtype == np.uint8
    assert item.fetch_ms >= 0
    assert item.decode_ms >= 0
    assert item.preprocess_ms >= 0


def test_a_missing_object_becomes_a_failure_instead_of_an_exception(clip: ClipModel) -> None:
    dataset = ImageDataset(["missing.png"], _DictSource({}), clip.image_transform)

    item = dataset[0]

    assert item.pixels is None
    assert item.error is not None
    assert item.error.startswith("fetch: ")


def test_bytes_that_are_not_an_image_become_a_failure(clip: ClipModel) -> None:
    dataset = ImageDataset(["a.png"], _DictSource({"a.png": b"not an image"}), clip.image_transform)

    item = dataset[0]

    assert item.pixels is None
    assert item.error is not None
    assert item.error.startswith("decode: ")


def test_collate_stacks_loaded_images_and_keeps_failures_apart(clip: ClipModel) -> None:
    source = _DictSource({"a.png": _png((200, 30, 30)), "c.png": _png((30, 30, 200))})
    dataset = ImageDataset(["a.png", "b.png", "c.png"], source, clip.image_transform)

    batch = collate_images([dataset[0], dataset[1], dataset[2]])

    assert batch.pixels is not None
    assert batch.pixels.shape == (2, 224, 224, 3)
    assert batch.indexes == [0, 2]
    assert [index for index, _ in batch.failures] == [1]
    np.testing.assert_array_equal(batch.pixels[1], dataset[2].pixels)


def test_collate_of_only_failures_has_no_pixels(clip: ClipModel) -> None:
    dataset = ImageDataset(["a.png"], _DictSource({}), clip.image_transform)

    batch = collate_images([dataset[0]])

    assert batch.pixels is None
    assert batch.indexes == []
    assert len(batch.failures) == 1


@pytest.mark.parametrize("size", [(64, 48), (48, 64), (300, 300)])
def test_images_of_any_aspect_ratio_stack_into_one_batch(
    clip: ClipModel, size: tuple[int, int]
) -> None:
    source = _DictSource({"a.png": _png((10, 20, 30), size), "b.png": _png((10, 20, 30))})
    dataset = ImageDataset(["a.png", "b.png"], source, clip.image_transform)

    batch = collate_images([dataset[0], dataset[1]])

    assert batch.pixels is not None
    assert batch.pixels.shape == (2, 224, 224, 3)


def test_the_batch_survives_the_trip_through_a_worker_pipe(clip: ClipModel) -> None:
    """DataLoader workers pickle the collated batch to send it to the main process."""
    dataset = ImageDataset(["a.png"], _DictSource({"a.png": _png((1, 2, 3))}), clip.image_transform)
    batch = collate_images([dataset[0]])

    restored = pickle.loads(pickle.dumps(batch))

    assert restored.indexes == batch.indexes
    assert restored.pixels is not None
    assert batch.pixels is not None
    np.testing.assert_array_equal(restored.pixels, batch.pixels)
