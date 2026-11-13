"""GrpcServer lifecycle on a real port: health statuses, bounded concurrency, graceful stop."""

import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import grpc
import pytest
from grpc_health.v1 import health_pb2

from ml_service.config import GrpcServerSettings
from ml_service.embeddings.clip_model import ClipModel
from ml_service.embeddings.domain import SearchHit, Vector
from ml_service.gen.meshdex.ml.v1 import ml_pb2, ml_pb2_grpc
from ml_service.search.search_service import SearchService
from ml_service.server.embedding_servicer import EmbeddingServicer
from ml_service.server.grpc_server import LIVENESS_SERVICE, READINESS_SERVICE, GrpcServer

SERVING = health_pb2.HealthCheckResponse.SERVING
NOT_SERVING = health_pb2.HealthCheckResponse.NOT_SERVING


class _BlockingIndex:
    """Holds every search until `release` is set, so tests control what is in flight."""

    def __init__(self) -> None:
        self.entered = threading.Semaphore(0)
        self.release = threading.Event()

    def search(self, model: str, query: Vector, limit: int) -> list[SearchHit]:
        self.entered.release()
        self.release.wait(timeout=10)

        return [SearchHit(asset_id=uuid4(), score=0.5)]


@pytest.fixture
def index() -> _BlockingIndex:
    return _BlockingIndex()


def _server(clip: ClipModel, index: _BlockingIndex, **settings: object) -> GrpcServer:
    config = GrpcServerSettings.model_validate(
        {"url": "127.0.0.1:0", "max_workers": 4, "shutdown_grace_s": 5, **settings}
    )

    return GrpcServer(EmbeddingServicer(SearchService(clip, index)), config)


@pytest.fixture
def channel_to() -> Iterator[list[grpc.Channel]]:
    """Channels opened by a test, closed after it."""
    channels: list[grpc.Channel] = []
    yield channels
    for channel in channels:
        channel.close()


def _channel(server: GrpcServer, channels: list[grpc.Channel]) -> grpc.Channel:
    channel = grpc.insecure_channel(f"127.0.0.1:{server.port}")
    channels.append(channel)

    return channel


def _health_check(channel: grpc.Channel, service: str) -> int:
    """Calls grpc.health.v1.Health/Check through the channel: the stubs of grpcio-health-checking
    declare no methods on HealthStub."""
    check = channel.unary_unary(
        "/grpc.health.v1.Health/Check",
        request_serializer=health_pb2.HealthCheckRequest.SerializeToString,
        response_deserializer=health_pb2.HealthCheckResponse.FromString,
    )
    response: health_pb2.HealthCheckResponse = check(
        health_pb2.HealthCheckRequest(service=service), timeout=5
    )

    return response.status


def _search(channel: grpc.Channel) -> ml_pb2.SearchAssetsResponse:
    return ml_pb2_grpc.EmbeddingServiceStub(channel).SearchAssets(
        ml_pb2.SearchAssetsRequest(query="chair", limit=1), timeout=10
    )


def test_liveness_and_readiness_serve_once_started(
    clip: ClipModel, index: _BlockingIndex, channel_to: list[grpc.Channel]
) -> None:
    server = _server(clip, index)
    server.start()
    try:
        channel = _channel(server, channel_to)
        for name in (LIVENESS_SERVICE, READINESS_SERVICE):
            assert _health_check(channel, name) == SERVING
    finally:
        index.release.set()
        server.stop()


def test_stop_turns_readiness_off_and_lets_in_flight_calls_finish(
    clip: ClipModel, index: _BlockingIndex, channel_to: list[grpc.Channel]
) -> None:
    server = _server(clip, index)
    server.start()
    channel = _channel(server, channel_to)
    # Health/Watch: a stream that sends the status now and on every change.
    watch = channel.unary_stream(
        "/grpc.health.v1.Health/Watch",
        request_serializer=health_pb2.HealthCheckRequest.SerializeToString,
        response_deserializer=health_pb2.HealthCheckResponse.FromString,
    )
    readiness = watch(health_pb2.HealthCheckRequest(service=READINESS_SERVICE), timeout=10)
    assert next(readiness).status == SERVING

    with ThreadPoolExecutor(max_workers=2) as pool:
        in_flight = pool.submit(_search, channel)
        assert index.entered.acquire(timeout=5)
        stopping = pool.submit(server.stop)

        # The watch stream is in flight too, so it sees readiness change before the server goes.
        assert next(readiness).status == NOT_SERVING
        # An open stream is an in-flight call as well: left open, it would hold stop() for the
        # whole grace period.
        readiness.cancel()
        assert not in_flight.done()
        index.release.set()

        assert len(in_flight.result(timeout=5).hits) == 1
        stopping.result(timeout=5)

    with pytest.raises(grpc.RpcError):
        _search(_channel(server, channel_to))


def test_calls_over_the_concurrency_limit_are_refused_not_queued(
    clip: ClipModel, index: _BlockingIndex, channel_to: list[grpc.Channel]
) -> None:
    server = _server(clip, index, max_concurrent_rpcs=1)
    server.start()
    channel = _channel(server, channel_to)
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(_search, channel)
            assert index.entered.acquire(timeout=5)

            with pytest.raises(grpc.RpcError) as raised:
                _search(channel)

            index.release.set()
            first.result(timeout=5)
    finally:
        index.release.set()
        server.stop()

    assert isinstance(raised.value, grpc.Call)
    assert raised.value.code() == grpc.StatusCode.RESOURCE_EXHAUSTED
