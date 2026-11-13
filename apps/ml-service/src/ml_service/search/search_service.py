"""Text search: the query is embedded with CLIP and matched against stored image embeddings."""

from ml_service.search.domain import SearchResult
from ml_service.search.exceptions import InvalidSearchQueryError
from ml_service.search.ports import EmbeddingsIndex, TextEmbedder


class SearchService:
    # Contract (meshdex.ml.v1.SearchAssetsRequest): 0 means the default, at most 100.
    DEFAULT_LIMIT = 20
    MAX_LIMIT = 100
    # CLIP reads at most 77 tokens and truncates the rest; the limit bounds tokenizer work per
    # request (ADR 019). Generous for "wooden industrial chair"-style queries.
    MAX_QUERY_LENGTH = 500

    def __init__(self, texts: TextEmbedder, index: EmbeddingsIndex) -> None:
        self._texts = texts
        self._index = index

    def search(self, query: str, limit: int) -> SearchResult:
        text = query.strip()
        if not text:
            raise InvalidSearchQueryError("query must not be empty")
        if len(text) > self.MAX_QUERY_LENGTH:
            raise InvalidSearchQueryError(
                f"query must be at most {self.MAX_QUERY_LENGTH} characters"
            )

        size = self.DEFAULT_LIMIT if limit == 0 else limit
        if not 1 <= size <= self.MAX_LIMIT:
            raise InvalidSearchQueryError(f"limit must be between 1 and {self.MAX_LIMIT}")

        [vector] = self._texts.embed_texts([text])
        model = self._texts.name

        return SearchResult(model=model, hits=self._index.search(model, vector, size))
