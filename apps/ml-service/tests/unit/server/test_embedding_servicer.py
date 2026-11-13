"""EmbeddingServicer over a real in-process gRPC server: message mapping and status codes."""

from collections.abc import Iterator
from concurrent import futures
from uuid import UUID, uuid4

import grpc
import pytest

from ml_service.embeddings.clip_model import ClipModel
from ml_service.embeddings.domain import SearchHit, Vector
from ml_service.gen.meshdex.ml.v1 import ml_pb2, ml_pb2_grpc
from ml_service.search.search_service import SearchService
from ml_service.server.embedding_servicer import EmbeddingServicer

HITS = [SearchHit(asset_id=uuid4(), score=0.42), SearchHit(asset_id=uuid4(), score=0.17)]


class _Index:
    def search(self, model: str, query: Vector, limit: int) -> list[SearchHit]:
        return HITS[:limit]


@pytest.fixture
def stub(clip: ClipModel) -> Iterator[ml_pb2_grpc.EmbeddingServiceStub]:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    ml_pb2_grpc.add_EmbeddingServiceServicer_to_server(
        EmbeddingServicer(SearchService(clip, _Index())), server
    )
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            yield ml_pb2_grpc.EmbeddingServiceStub(channel)
    finally:
        server.stop(grace=None)


def test_search_returns_hits_best_first_with_the_model(
    stub: ml_pb2_grpc.EmbeddingServiceStub, clip: ClipModel
) -> None:
    response = stub.SearchAssets(ml_pb2.SearchAssetsRequest(query="wooden chair", limit=10))

    assert response.model == clip.name
    assert [UUID(hit.asset_id) for hit in response.hits] == [hit.asset_id for hit in HITS]
    assert response.hits[0].score == pytest.approx(0.42)


def test_an_invalid_query_is_invalid_argument(stub: ml_pb2_grpc.EmbeddingServiceStub) -> None:
    with pytest.raises(grpc.RpcError) as raised:
        stub.SearchAssets(ml_pb2.SearchAssetsRequest(query="  ", limit=10))

    assert isinstance(raised.value, grpc.Call)
    assert raised.value.code() == grpc.StatusCode.INVALID_ARGUMENT
    assert "empty" in (raised.value.details() or "")


def test_embed_asset_is_unimplemented_until_the_worker_exists(
    stub: ml_pb2_grpc.EmbeddingServiceStub,
) -> None:
    with pytest.raises(grpc.RpcError) as raised:
        stub.EmbedAsset(ml_pb2.EmbedAssetRequest(asset_id=str(uuid4())))

    assert isinstance(raised.value, grpc.Call)
    assert raised.value.code() == grpc.StatusCode.UNIMPLEMENTED
