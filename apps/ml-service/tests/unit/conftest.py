from typing import Any

import open_clip
import pytest
import torch

from ml_service.embeddings.clip_model import ClipModel

# Random weights: fast, and independent of the 600 MB weights file (tests/model/ checks that).
ARCHITECTURE = "ViT-S-32"
DIMENSIONS = 384


@pytest.fixture(scope="session")
def reference_preprocess() -> Any:
    _, _, preprocess = open_clip.create_model_and_transforms(ARCHITECTURE, pretrained=None)

    return preprocess


@pytest.fixture(scope="session")
def random_model() -> open_clip.CLIP:
    torch.manual_seed(0)

    return open_clip.create_model(ARCHITECTURE, pretrained=None).eval()


@pytest.fixture(scope="session")
def clip(random_model: open_clip.CLIP, reference_preprocess: Any) -> ClipModel:
    return ClipModel(
        model=random_model,
        preprocess=reference_preprocess,
        tokenizer=open_clip.get_tokenizer(ARCHITECTURE),
        name=f"{ARCHITECTURE}/random",
        dimensions=DIMENSIONS,
        device=torch.device("cpu"),
    )
