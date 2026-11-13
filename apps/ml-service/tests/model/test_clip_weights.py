"""The real CLIP weights load offline and rank captions sensibly.

Needs the weights file (~600 MB, not in the repository, apps/ml-service/.cache is gitignored), so
the module is skipped with a visible reason when it's absent.
"""

from pathlib import Path

import numpy as np
import pytest
import torch
from PIL import Image

from ml_service.config import ClipSettings
from ml_service.embeddings.clip_model import ClipModel, load_clip_model

CHECKPOINT = (
    Path(__file__).resolve().parents[2]
    / ".cache"
    / "models"
    / "open_clip_ViT-B-32_laion2b_s34b_b79k.safetensors"
)

pytestmark = pytest.mark.skipif(
    not CHECKPOINT.is_file(), reason=f"CLIP weights not downloaded to {CHECKPOINT}"
)


@pytest.fixture(scope="module")
def clip() -> ClipModel:
    settings = ClipSettings(
        architecture="ViT-B-32", pretrained="laion2b_s34b_b79k", checkpoint_path=CHECKPOINT
    )

    return load_clip_model(settings)


def test_loads_the_configured_model(clip: ClipModel) -> None:
    assert clip.name == "ViT-B-32/laion2b_s34b_b79k"
    assert clip.dimensions == 512


def test_matches_images_to_their_captions(clip: ClipModel) -> None:
    colors = {"red": (220, 20, 20), "green": (20, 180, 20), "blue": (20, 40, 220)}
    pixels = torch.stack(
        [clip.preprocess(Image.new("RGB", (256, 256), rgb)) for rgb in colors.values()]
    )
    captions = [f"a plain {name} square" for name in colors]

    similarity = clip.embed_images(pixels) @ clip.embed_texts(captions).T

    # Each image is closest to its own caption.
    assert list(np.argmax(similarity, axis=1)) == [0, 1, 2]
