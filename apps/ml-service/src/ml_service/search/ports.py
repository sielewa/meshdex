from collections.abc import Sequence
from typing import Protocol

from ml_service.embeddings.clip_model import Embeddings
from ml_service.embeddings.domain import SearchHit, Vector


class TextEmbedder(Protocol):
    @property
    def name(self) -> str: ...

    def embed_texts(self, texts: Sequence[str]) -> Embeddings: ...


class EmbeddingsIndex(Protocol):
    def search(self, model: str, query: Vector, limit: int) -> list[SearchHit]: ...
