"""What search needs from the outside world; adapters satisfy these structurally."""

from collections.abc import Sequence
from typing import Protocol

from ml_service.embeddings.clip_model import Embeddings
from ml_service.embeddings.domain import SearchHit, Vector


class TextEmbedder(Protocol):
    """ClipModel: `name` identifies the model whose vectors it returns."""

    @property
    def name(self) -> str: ...

    def embed_texts(self, texts: Sequence[str]) -> Embeddings: ...


class EmbeddingsIndex(Protocol):
    """EmbeddingsRepository."""

    def search(self, model: str, query: Vector, limit: int) -> list[SearchHit]: ...
