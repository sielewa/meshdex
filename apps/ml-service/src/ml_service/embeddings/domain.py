from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

import numpy as np
import numpy.typing as npt

# L2-normalised.
Vector = npt.NDArray[np.float32]


@dataclass(frozen=True, slots=True)
class ImageEmbedding:
    image_key: str
    vector: Vector


@dataclass(frozen=True, slots=True)
class VersionEmbeddings:
    asset_id: UUID
    asset_version_id: UUID
    # An older version never replaces a newer one.
    version_number: int
    images: Sequence[ImageEmbedding]


@dataclass(frozen=True, slots=True)
class SearchHit:
    asset_id: UUID
    # Cosine similarity of the asset's best-matching image.
    score: float
