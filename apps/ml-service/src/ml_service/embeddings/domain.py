"""Domain types of the embeddings feature: declarations only, no I/O."""

from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

import numpy as np
import numpy.typing as npt

# One L2-normalised vector, float32 (see clip_model.py).
Vector = npt.NDArray[np.float32]


@dataclass(frozen=True, slots=True)
class ImageEmbedding:
    image_key: str
    vector: Vector


@dataclass(frozen=True, slots=True)
class VersionEmbeddings:
    """Embeddings of every image of one asset version."""

    asset_id: UUID
    asset_version_id: UUID
    # Per-asset version number: an older version never replaces a newer one.
    version_number: int
    images: Sequence[ImageEmbedding]


@dataclass(frozen=True, slots=True)
class SearchHit:
    asset_id: UUID
    # Cosine similarity in [-1, 1] of the asset's best-matching image; higher is more similar.
    score: float
