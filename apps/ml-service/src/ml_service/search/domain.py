from collections.abc import Sequence
from dataclasses import dataclass

from ml_service.embeddings.domain import SearchHit


@dataclass(frozen=True, slots=True)
class SearchResult:
    model: str
    # Best match first.
    hits: Sequence[SearchHit]
