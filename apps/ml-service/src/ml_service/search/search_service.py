from ml_service.search.domain import SearchResult
from ml_service.search.exceptions import InvalidSearchQueryError
from ml_service.search.ports import EmbeddingsIndex, TextEmbedder


class SearchService:
    # From the contract: limit 0 means the default.
    DEFAULT_LIMIT = 20
    MAX_LIMIT = 100
    # CLIP truncates at 77 tokens anyway; this bounds tokenizer work per request (ADR 019).
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
