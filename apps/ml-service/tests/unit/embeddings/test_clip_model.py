"""ClipModel mechanics on a small randomly initialised model: shapes, normalisation, batching.

Random weights make the vectors meaningless but keep the test fast (ViT-S-32 builds in ~0.5 s) and
independent of the 600 MB weights file; tests/model/ checks the real model.
"""

import pickle
from pathlib import Path

import numpy as np
import open_clip
import pytest
import torch
from PIL import Image

from ml_service.config import ClipSettings
from ml_service.embeddings.clip_model import ClipModel, UnknownPretrainedTagError, load_clip_model

ARCHITECTURE = "ViT-S-32"
DIMENSIONS = 384


@pytest.fixture(scope="session")
def clip() -> ClipModel:
    torch.manual_seed(0)
    model, _, preprocess = open_clip.create_model_and_transforms(ARCHITECTURE, pretrained=None)

    return ClipModel(
        model=model,
        preprocess=preprocess,
        tokenizer=open_clip.get_tokenizer(ARCHITECTURE),
        name=f"{ARCHITECTURE}/random",
        dimensions=DIMENSIONS,
        device=torch.device("cpu"),
    )


def _image(color: tuple[int, int, int], size: tuple[int, int] = (320, 240)) -> Image.Image:
    return Image.new("RGB", size, color)


def test_embeds_images_into_unit_length_float32_vectors(clip: ClipModel) -> None:
    images = [_image((200, 30, 30)), _image((30, 200, 30), (100, 400)), _image((30, 30, 200))]
    pixels = torch.stack([clip.preprocess(image) for image in images])

    embeddings = clip.embed_images(pixels)

    assert embeddings.shape == (3, DIMENSIONS)
    assert embeddings.dtype == np.float32
    np.testing.assert_allclose(np.linalg.norm(embeddings, axis=1), 1.0, rtol=1e-5)


def test_embeds_texts_into_the_same_space(clip: ClipModel) -> None:
    embeddings = clip.embed_texts(["wooden chair", "rusty industrial barrel"])

    assert embeddings.shape == (2, DIMENSIONS)
    np.testing.assert_allclose(np.linalg.norm(embeddings, axis=1), 1.0, rtol=1e-5)


def test_an_image_embeds_the_same_alone_and_in_a_batch(clip: ClipModel) -> None:
    """Batch size may change throughput, never results (the reindex benchmark relies on it)."""
    images = [_image((200, 30, 30)), _image((30, 200, 30)), _image((30, 30, 200))]
    pixels = torch.stack([clip.preprocess(image) for image in images])

    batched = clip.embed_images(pixels)
    alone = clip.embed_images(pixels[1:2])

    np.testing.assert_allclose(batched[1], alone[0], atol=1e-5)


@pytest.mark.parametrize("mode", ["RGBA", "L", "P", "CMYK"])
def test_preprocess_accepts_any_image_mode(clip: ClipModel, mode: str) -> None:
    image = Image.new(mode, (64, 48))

    pixels = clip.preprocess(image)

    assert pixels.shape == (3, 224, 224)


def test_preprocess_survives_pickling_for_dataloader_workers(clip: ClipModel) -> None:
    image = _image((120, 60, 10))

    restored = pickle.loads(pickle.dumps(clip.preprocess))

    assert torch.equal(restored(image), clip.preprocess(image))


def test_refuses_a_pretrained_tag_open_clip_does_not_know(tmp_path: Path) -> None:
    checkpoint = tmp_path / "weights.safetensors"
    checkpoint.write_bytes(b"")
    settings = ClipSettings(
        architecture="ViT-B-32", pretrained="unknown_tag", checkpoint_path=checkpoint
    )

    with pytest.raises(UnknownPretrainedTagError, match="unknown_tag"):
        load_clip_model(settings)
