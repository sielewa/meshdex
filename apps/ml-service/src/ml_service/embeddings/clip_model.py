"""CLIP from open_clip: images and texts embedded into one vector space (ADR 018).

Every vector returned is L2-normalised float32, so cosine similarity is a dot product and matches
pgvector's cosine distance (`<=>`) on the stored vectors.

Image preprocessing is split in two (docs/data-processing.md, "uint8 images to the model"):
`image_transform` does the pixel work (resize, crop, RGB) and returns uint8, in DataLoader workers;
`embed_images` converts to float and normalises on the model's device. A uint8 image is a quarter
of the float32 one, so moving batches between processes and to the GPU costs a quarter too.
"""

import os
import threading

# Never download at runtime (ADR 018). Set before open_clip imports huggingface_hub, which reads
# the variable once at import. An exported value still wins.
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
# Batch of images as `image_transform` returns them, stacked: (n, height, width, 3), uint8.
ImagePixels = npt.NDArray[np.uint8]


class UnknownPretrainedTagError(Exception):
    """open_clip doesn't know the architecture/tag pair, so its preprocessing is unknown."""


class UnsupportedPreprocessError(Exception):
    """open_clip's preprocessing doesn't end with ToTensor + Normalize, so it can't be split."""


class ImageTransform:
    """PIL image → uint8 array (height, width, 3): resize, crop and RGB conversion.

    Runs in DataLoader worker processes, so it is picklable: a module-level class holding
    torchvision transforms, no lambdas.
    """

    def __init__(self, pixel_steps: Sequence[Callable[[Image.Image], Image.Image]]) -> None:
        self._pixel_steps = list(pixel_steps)

    def __call__(self, image: Image.Image) -> ImagePixels:
        for step in self._pixel_steps:
            image = step(image)

        return np.asarray(image, dtype=np.uint8)


class ClipModel:
    """A loaded CLIP model in inference mode.

    Thread-safe: one call runs the model at a time (ADR 019). Concurrent calls on one device
    wouldn't be faster, and torch on mps isn't documented as thread-safe. torch releases the GIL
    inside its kernels, so threads waiting here don't block the rest of the process.
    """

    def __init__(
        self,
        model: open_clip.CLIP,
        # open_clip's torchvision Compose (untyped).
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
        # Shaped to broadcast over (n, 3, height, width), kept on the model's device.
        self._mean = torch.tensor(mean, device=device).view(1, 3, 1, 1)
        self._std = torch.tensor(std, device=device).view(1, 3, 1, 1)
        # Stored with every embedding: vectors of different models are not comparable.
        self.name = name
        self.dimensions = dimensions

    def embed_images(self, pixels: torch.Tensor) -> Embeddings:
        """Embeds a batch from `image_transform`: uint8, shape (n, height, width, 3)."""
        with self._lock, torch.inference_mode():
            # Same arithmetic as torchvision's ToTensor + Normalize, on the device.
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
        # The copy to the CPU waits for the device, so callers time the model's real work.
        return features.float().cpu().numpy()


def _split_preprocess(preprocess: Any) -> tuple[ImageTransform, Sequence[float], Sequence[float]]:
    """open_clip's pipeline is [pixel steps..., ToTensor, Normalize]: the pixel steps go to the
    workers, ToTensor + Normalize to `embed_images`. Anything else fails at load time instead of
    preprocessing images differently from training."""
    *pixel_steps, to_tensor, normalize = preprocess.transforms
    if (
        type(to_tensor).__name__ not in {"ToTensor", "MaybeToTensor"}
        or type(normalize).__name__ != "Normalize"
    ):
        raise UnsupportedPreprocessError(f"unexpected open_clip preprocessing: {preprocess}")

    return ImageTransform(pixel_steps), tuple(normalize.mean), tuple(normalize.std)


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
