"""CLIP from open_clip (ADR 018). Vectors are L2-normalised float32.

Preprocessing is split: `image_transform` resizes and crops to uint8 in the loader workers,
`embed_images` normalises on the device, so batches move as uint8 (docs/data-processing.md).
"""

import os
import threading

# Never download at runtime (ADR 018). huggingface_hub reads this once at import.
os.environ.setdefault("HF_HUB_OFFLINE", "1")

from collections.abc import Callable, Sequence
from typing import Any

import numpy as np
import numpy.typing as npt
import open_clip
import torch
from PIL import Image

from ml_service.config import ClipSettings

Embeddings = npt.NDArray[np.float32]
# (n, height, width, 3)
ImagePixels = npt.NDArray[np.uint8]


class UnknownPretrainedTagError(Exception):
    pass


class UnsupportedPreprocessError(Exception):
    pass


class ImageTransform:
    """A class rather than a closure so it pickles into the loader workers."""

    def __init__(self, pixel_steps: Sequence[Callable[[Image.Image], Image.Image]]) -> None:
        self._pixel_steps = list(pixel_steps)

    def __call__(self, image: Image.Image) -> ImagePixels:
        for step in self._pixel_steps:
            image = step(image)

        return np.asarray(image, dtype=np.uint8)


class ClipModel:
    """One call runs the model at a time (ADR 019): parallel calls on one device aren't faster,
    and torch on mps isn't documented as thread-safe."""

    def __init__(
        self,
        model: open_clip.CLIP,
        preprocess: Any,
        tokenizer: Callable[[list[str]], torch.Tensor],
        name: str,
        dimensions: int,
        device: torch.device,
    ) -> None:
        self._model = model.eval()
        self._tokenizer = tokenizer
        self._device = device
        self._lock = threading.Lock()
        self.image_transform, mean, std = _split_preprocess(preprocess)
        self._mean = torch.tensor(mean, device=device).view(1, 3, 1, 1)
        self._std = torch.tensor(std, device=device).view(1, 3, 1, 1)
        # Stored with every embedding: vectors of different models aren't comparable.
        self.name = name
        self.dimensions = dimensions

    def embed_images(self, pixels: torch.Tensor) -> Embeddings:
        with self._lock, torch.inference_mode():
            # torchvision's ToTensor + Normalize, on the device.
            batch = pixels.to(self._device).permute(0, 3, 1, 2).float().div_(255)
            batch = batch.sub_(self._mean).div_(self._std)
            features = self._model.encode_image(batch, normalize=True)

        return self._to_numpy(features)

    def embed_texts(self, texts: Sequence[str]) -> Embeddings:
        with self._lock, torch.inference_mode():
            tokens = self._tokenizer(list(texts)).to(self._device)
            features = self._model.encode_text(tokens, normalize=True)

        return self._to_numpy(features)

    @staticmethod
    def _to_numpy(features: torch.Tensor) -> Embeddings:
        return features.float().cpu().numpy()


def _split_preprocess(preprocess: Any) -> tuple[ImageTransform, Sequence[float], Sequence[float]]:
    """Splits [pixel steps..., ToTensor, Normalize]; any other shape fails at load time rather
    than preprocessing differently from training."""
    *pixel_steps, to_tensor, normalize = preprocess.transforms
    if (
        type(to_tensor).__name__ not in {"ToTensor", "MaybeToTensor"}
        or type(normalize).__name__ != "Normalize"
    ):
        raise UnsupportedPreprocessError(f"unexpected open_clip preprocessing: {preprocess}")

    return ImageTransform(pixel_steps), tuple(normalize.mean), tuple(normalize.std)


def load_clip_model(settings: ClipSettings) -> ClipModel:
    """open_clip applies a tag's preprocessing only when it downloads the weights itself; for a
    local file it uses architecture defaults, so the tag's values are passed explicitly."""
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
