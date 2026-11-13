"""Domain types of the search feature: declarations only, no I/O."""

from collections.abc import Sequence
from dataclasses import dataclass

from ml_service.embeddings.domain import SearchHit


@dataclass(frozen=True, slots=True)
class SearchResult:
    # The model whose embeddings were searched; scores of different models aren't comparable.
    model: str
    # Best match first.
    hits: Sequence[SearchHit]
