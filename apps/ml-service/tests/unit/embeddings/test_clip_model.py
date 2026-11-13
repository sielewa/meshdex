"""ClipModel mechanics on a small randomly initialised model (tests/unit/conftest.py): shapes,
normalisation, batching, the split preprocessing."""

import pickle
from pathlib import Path
from typing import Any

import numpy as np
import open_clip
import pytest
import torch
from PIL import Image

from ml_service.config import ClipSettings
from ml_service.embeddings.clip_model import (
    ClipModel,
    UnknownPretrainedTagError,
    UnsupportedPreprocessError,
    load_clip_model,
)


def _image(color: tuple[int, int, int], size: tuple[int, int] = (320, 240)) -> Image.Image:
    return Image.new("RGB", size, color)


def _pixels(clip: ClipModel, images: list[Image.Image]) -> torch.Tensor:
    """Stacked the way the reindex job's collate stacks them."""
    return torch.from_numpy(np.stack([clip.image_transform(image) for image in images]))


def test_embeds_images_into_unit_length_float32_vectors(clip: ClipModel) -> None:
    images = [_image((200, 30, 30)), _image((30, 200, 30), (100, 400)), _image((30, 30, 200))]
    pixels = _pixels(clip, images)

    embeddings = clip.embed_images(pixels)

    assert embeddings.shape == (3, clip.dimensions)
    assert embeddings.dtype == np.float32
    np.testing.assert_allclose(np.linalg.norm(embeddings, axis=1), 1.0, rtol=1e-5)


def test_embeds_texts_into_the_same_space(clip: ClipModel) -> None:
    embeddings = clip.embed_texts(["wooden chair", "rusty industrial barrel"])

    assert embeddings.shape == (2, clip.dimensions)
    np.testing.assert_allclose(np.linalg.norm(embeddings, axis=1), 1.0, rtol=1e-5)


def test_an_image_embeds_the_same_alone_and_in_a_batch(clip: ClipModel) -> None:
    """Batch size may change throughput, never results (the reindex benchmark relies on it)."""
    images = [_image((200, 30, 30)), _image((30, 200, 30)), _image((30, 30, 200))]
    pixels = _pixels(clip, images)

    batched = clip.embed_images(pixels)
    alone = clip.embed_images(pixels[1:2])

    np.testing.assert_allclose(batched[1], alone[0], atol=1e-5)


def test_split_preprocessing_embeds_like_open_clips_own(
    clip: ClipModel, random_model: open_clip.CLIP, reference_preprocess: Any
) -> None:
    """uint8 in the worker + ToTensor/Normalize on the device must equal open_clip's pipeline:
    a different input distribution than in training would silently degrade search."""
    gradient = np.linspace(0, 255, 320 * 240 * 3).reshape(240, 320, 3).astype(np.uint8)
    images = [Image.fromarray(gradient), _image((30, 200, 30), (100, 400))]
    reference = torch.stack([reference_preprocess(image) for image in images])

    with torch.inference_mode():
        expected = random_model.encode_image(reference, normalize=True).numpy()
    actual = clip.embed_images(_pixels(clip, images))

    np.testing.assert_allclose(actual, expected, atol=1e-5)


@pytest.mark.parametrize("mode", ["RGBA", "L", "P", "CMYK"])
def test_image_transform_accepts_any_image_mode(clip: ClipModel, mode: str) -> None:
    image = Image.new(mode, (64, 48))

    pixels = clip.image_transform(image)

    assert pixels.shape == (224, 224, 3)
    assert pixels.dtype == np.uint8


def test_image_transform_survives_pickling_for_dataloader_workers(clip: ClipModel) -> None:
    image = _image((120, 60, 10))

    restored = pickle.loads(pickle.dumps(clip.image_transform))

    np.testing.assert_array_equal(restored(image), clip.image_transform(image))


def test_refuses_preprocessing_it_cannot_split(
    random_model: open_clip.CLIP, reference_preprocess: Any
) -> None:
    without_normalize = type(reference_preprocess)(reference_preprocess.transforms[:-1])

    with pytest.raises(UnsupportedPreprocessError):
        ClipModel(
            model=random_model,
            preprocess=without_normalize,
            tokenizer=open_clip.get_tokenizer("ViT-S-32"),
            name="ViT-S-32/random",
            dimensions=384,
            device=torch.device("cpu"),
        )


def test_refuses_a_pretrained_tag_open_clip_does_not_know(tmp_path: Path) -> None:
    checkpoint = tmp_path / "weights.safetensors"
    checkpoint.write_bytes(b"")
    settings = ClipSettings(
        architecture="ViT-B-32", pretrained="unknown_tag", checkpoint_path=checkpoint
    )

    with pytest.raises(UnknownPretrainedTagError, match="unknown_tag"):
        load_clip_model(settings)
