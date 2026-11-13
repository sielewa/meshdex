"""AssetServiceClient against an in-process gRPC server: paging, translation, deadline."""

import time
from collections.abc import Iterator
from concurrent import futures
from uuid import UUID, uuid4

import grpc
import pytest

from ml_service.clients.asset_service.asset_service_client import (
    LIST_PAGE_SIZE,
    SERVICE,
    AssetServiceClient,
    create_channel,
)
from ml_service.config import AssetServiceSettings
from ml_service.gen.meshdex.asset.v1 import asset_pb2


class _AssetService:
    """Serves `assets` in pages of the requested size; the page token is the next offset.

    Registered as a generic handler for ListAssets only: the generated servicer base declares
    every RPC abstract in its type stubs.
    """

    def __init__(self) -> None:
        self.assets: list[asset_pb2.Asset] = []
        self.delay_s = 0.0
        self.requests: list[asset_pb2.ListAssetsRequest] = []

    def list_assets(
        self, request: asset_pb2.ListAssetsRequest, context: grpc.ServicerContext
    ) -> asset_pb2.ListAssetsResponse:
        self.requests.append(request)
        time.sleep(self.delay_s)
        start = int(request.page_token or 0)
        end = start + request.page_size

        return asset_pb2.ListAssetsResponse(
            assets=self.assets[start:end],
            next_page_token=str(end) if end < len(self.assets) else "",
        )

    def handler(self) -> grpc.GenericRpcHandler:
        return grpc.method_handlers_generic_handler(
            SERVICE,
            {
                "ListAssets": grpc.unary_unary_rpc_method_handler(
                    self.list_assets,
                    request_deserializer=asset_pb2.ListAssetsRequest.FromString,
                    response_serializer=asset_pb2.ListAssetsResponse.SerializeToString,
                )
            },
        )


@pytest.fixture
def service() -> _AssetService:
    return _AssetService()


@pytest.fixture
def address(service: _AssetService) -> Iterator[str]:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    server.add_generic_rpc_handlers((service.handler(),))
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    try:
        yield f"127.0.0.1:{port}"
    finally:
        server.stop(grace=None)


@pytest.fixture
def client(address: str) -> Iterator[AssetServiceClient]:
    with create_channel(AssetServiceSettings(url=address)) as channel:
        yield AssetServiceClient(channel)


def _asset(*, preview_key: str | None = "public/preview.webp", number: int = 1) -> asset_pb2.Asset:
    asset_id = str(uuid4())
    version = asset_pb2.AssetVersion(id=str(uuid4()), asset_id=asset_id, number=number)
    if preview_key is not None:
        version.source_preview.CopyFrom(asset_pb2.StoredObject(key=preview_key))

    return asset_pb2.Asset(id=asset_id, title="Chair", current_version=version)


def test_translates_an_asset_to_its_current_version(
    service: _AssetService, client: AssetServiceClient
) -> None:
    asset = _asset(preview_key="public/chair.webp", number=3)
    service.assets = [asset]

    [version] = list(client.list_current_versions())

    assert version.asset_id == UUID(asset.id)
    assert version.asset_version_id == UUID(asset.current_version.id)
    assert version.version_number == 3
    assert version.image_keys == ("public/chair.webp",)


def test_a_version_without_a_source_preview_has_no_images(
    service: _AssetService, client: AssetServiceClient
) -> None:
    service.assets = [_asset(preview_key=None)]

    [version] = list(client.list_current_versions())

    assert version.image_keys == ()


def test_skips_assets_without_a_current_version(
    service: _AssetService, client: AssetServiceClient
) -> None:
    service.assets = [asset_pb2.Asset(id=str(uuid4()), title="Empty"), _asset()]

    versions = list(client.list_current_versions())

    assert [str(version.asset_id) for version in versions] == [service.assets[1].id]


def test_follows_page_tokens_with_the_largest_page_size(
    service: _AssetService, client: AssetServiceClient
) -> None:
    service.assets = [_asset() for _ in range(LIST_PAGE_SIZE * 2 + 5)]

    versions = list(client.list_current_versions())

    assert len(versions) == len(service.assets)
    assert [request.page_token for request in service.requests] == [
        "",
        str(LIST_PAGE_SIZE),
        str(LIST_PAGE_SIZE * 2),
    ]
    assert {request.page_size for request in service.requests} == {LIST_PAGE_SIZE}


def test_a_call_past_its_deadline_fails_instead_of_hanging(
    service: _AssetService, address: str
) -> None:
    """The deadline comes from the channel's service config, not from the call site."""
    service.delay_s = 1.0
    settings = AssetServiceSettings(url=address, read_timeout_ms=100)

    with create_channel(settings) as channel, pytest.raises(grpc.RpcError) as raised:
        list(AssetServiceClient(channel).list_current_versions())

    assert isinstance(raised.value, grpc.Call)
    assert raised.value.code() == grpc.StatusCode.DEADLINE_EXCEEDED
