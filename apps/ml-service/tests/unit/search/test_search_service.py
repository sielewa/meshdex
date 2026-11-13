"""SearchService with an in-memory index and the random CLIP model (tests/unit/conftest.py)."""

from uuid import uuid4

import numpy as np
import pytest

from ml_service.embeddings.clip_model import ClipModel
from ml_service.embeddings.domain import SearchHit, Vector
from ml_service.search.exceptions import InvalidSearchQueryError
from ml_service.search.search_service import SearchService


class _Index:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Vector, int]] = []
        self.hits = [
            SearchHit(asset_id=uuid4(), score=0.31),
            SearchHit(asset_id=uuid4(), score=0.2),
        ]

    def search(self, model: str, query: Vector, limit: int) -> list[SearchHit]:
        self.calls.append((model, query, limit))

        return self.hits[:limit]


def test_searches_the_index_with_the_querys_embedding(clip: ClipModel) -> None:
    index = _Index()

    result = SearchService(clip, index).search("wooden chair", 5)

    [(model, vector, limit)] = index.calls
    assert model == clip.name
    assert limit == 5
    np.testing.assert_allclose(vector, clip.embed_texts(["wooden chair"])[0], atol=1e-6)
    assert result.model == clip.name
    assert result.hits == index.hits


def test_surrounding_whitespace_doesnt_change_the_query(clip: ClipModel) -> None:
    index = _Index()

    SearchService(clip, index).search("  wooden chair\n", 5)

    np.testing.assert_allclose(index.calls[0][1], clip.embed_texts(["wooden chair"])[0], atol=1e-6)


def test_limit_zero_means_the_default(clip: ClipModel) -> None:
    index = _Index()

    SearchService(clip, index).search("barrel", 0)

    assert index.calls[0][2] == SearchService.DEFAULT_LIMIT


@pytest.mark.parametrize(
    ("query", "limit"),
    [
        ("", 10),
        ("   ", 10),
        ("x" * (SearchService.MAX_QUERY_LENGTH + 1), 10),
        ("barrel", -1),
        ("barrel", SearchService.MAX_LIMIT + 1),
    ],
)
def test_rejects_queries_and_limits_outside_the_contract(
    clip: ClipModel, query: str, limit: int
) -> None:
    index = _Index()

    with pytest.raises(InvalidSearchQueryError):
        SearchService(clip, index).search(query, limit)

    assert index.calls == []


def test_accepts_the_longest_allowed_query(clip: ClipModel) -> None:
    index = _Index()

    SearchService(clip, index).search("x" * SearchService.MAX_QUERY_LENGTH, 1)

    assert len(index.calls) == 1
