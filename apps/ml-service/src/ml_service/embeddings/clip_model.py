"""CLIP from open_clip: images and texts embedded into one vector space (ADR 018).

Every vector returned is L2-normalised float32, so cosine similarity is a dot product and matches
pgvector's cosine distance (`<=>`) on the stored vectors.
"""

import os

# Never download at runtime (ADR 018). Set before open_clip imports huggingface_hub, which reads
# the variable once at import. An exported value still wins.
os.environ.setdefault("HF_HUB_OFFLINE", "1")

from collections.abc import Callable, Sequence

import numpy as np
import numpy.typing as npt
import open_clip
import torch
from PIL import Image

from ml_service.config import ClipSettings

Embeddings = npt.NDArray[np.float32]
Preprocess = Callable[[Image.Image], torch.Tensor]


class UnknownPretrainedTagError(Exception):
    """open_clip doesn't know the architecture/tag pair, so its preprocessing is unknown."""


class ClipModel:
    """A loaded CLIP model in inference mode.

    `preprocess` turns one PIL image into the model's input tensor. It runs in DataLoader worker
    processes (reindex job), so it must stay picklable: open_clip builds it from torchvision
    transforms and module-level functions, no lambdas.
    """

    def __init__(
        self,
        model: open_clip.CLIP,
        preprocess: Preprocess,
        tokenizer: Callable[[list[str]], torch.Tensor],
        name: str,
        dimensions: int,
        device: torch.device,
    ) -> None:
        self._model = model.eval()
        self._tokenizer = tokenizer
        self._device = device
        self.preprocess = preprocess
        # Stored with every embedding: vectors of different models are not comparable.
        self.name = name
        self.dimensions = dimensions

    def embed_images(self, pixels: torch.Tensor) -> Embeddings:
        """Embeds a batch of preprocessed images, shape (n, 3, height, width)."""
        with torch.inference_mode():
            features = self._model.encode_image(pixels.to(self._device), normalize=True)

        return self._to_numpy(features)

    def embed_texts(self, texts: Sequence[str]) -> Embeddings:
        with torch.inference_mode():
            tokens = self._tokenizer(list(texts)).to(self._device)
            features = self._model.encode_text(tokens, normalize=True)

        return self._to_numpy(features)

    @staticmethod
    def _to_numpy(features: torch.Tensor) -> Embeddings:
        return features.float().cpu().numpy()


def load_clip_model(settings: ClipSettings) -> ClipModel:
    """Loads the weights file with the preprocessing registered for the pretrained tag.

    open_clip applies a tag's preprocessing (mean/std, interpolation, resize mode, QuickGELU) only
    when it downloads the weights itself; for a file path it falls back to architecture defaults.
    Passing the tag's values explicitly keeps images preprocessed exactly as in training, which
    matters as soon as a model whose values differ from the defaults is configured.
    """
    pretrained_cfg = open_clip.get_pretrained_cfg(settings.architecture, settings.pretrained)
    model_cfg = open_clip.get_model_config(settings.architecture)
    if not pretrained_cfg or model_cfg is None:
        raise UnknownPretrainedTagError(
            f"open_clip has no pretrained tag {settings.pretrained!r} "
            f"for architecture {settings.architecture!r}"
        )

    device = torch.device(settings.device)
    model, _, preprocess = open_clip.create_model_and_transforms(
        settings.architecture,
        pretrained=str(settings.checkpoint_path),
        device=device,
        image_mean=pretrained_cfg.get("mean"),
        image_std=pretrained_cfg.get("std"),
        image_interpolation=pretrained_cfg.get("interpolation"),
        image_resize_mode=pretrained_cfg.get("resize_mode"),
        force_quick_gelu=bool(pretrained_cfg.get("quick_gelu", False)),
    )

    return ClipModel(
        model=model,
        preprocess=preprocess,
        tokenizer=open_clip.get_tokenizer(settings.architecture),
        name=f"{settings.architecture}/{settings.pretrained}",
        dimensions=int(model_cfg["embed_dim"]),
        device=device,
    )
