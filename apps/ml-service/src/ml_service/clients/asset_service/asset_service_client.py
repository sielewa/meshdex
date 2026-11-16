import json
from collections.abc import Iterator
from uuid import UUID

import grpc

from ml_service.clients.asset_service.domain import CatalogVersion
from ml_service.config import AssetServiceSettings
from ml_service.gen.meshdex.asset.v1 import asset_pb2, asset_pb2_grpc

SERVICE = "meshdex.asset.v1.AssetService"
# ListAssets' maximum.
LIST_PAGE_SIZE = 100

# As in the gateway: only UNAVAILABLE is safe to retry for any call.
RETRY_POLICY = {
    "maxAttempts": 3,
    "initialBackoff": "0.1s",
    "maxBackoff": "1s",
    "backoffMultiplier": 2,
    "retryableStatusCodes": ["UNAVAILABLE"],
}


def _service_config(settings: AssetServiceSettings) -> str:
    # In the channel's service config, so no call site can forget the deadline.
    read_methods = [{"service": SERVICE, "method": "ListAssets"}]

    return json.dumps(
        {
            "methodConfig": [
                {
                    "name": read_methods,
                    # Retries included.
                    "timeout": f"{settings.read_timeout_ms / 1000:.3f}s",
                    "retryPolicy": RETRY_POLICY,
                }
            ]
        }
    )


def create_channel(settings: AssetServiceSettings) -> grpc.Channel:
    return grpc.insecure_channel(
        settings.url,
        options=[
            ("grpc.service_config", _service_config(settings)),
            ("grpc.enable_retries", 1),
        ],
    )


class AssetServiceClient:
    def __init__(self, channel: grpc.Channel) -> None:
        self._stub = asset_pb2_grpc.AssetServiceStub(channel)

    def list_current_versions(self) -> Iterator[CatalogVersion]:
        # The image is the source preview until the processing worker renders thumbnails (ADR 017).
        page_token = ""
        while True:
            response = self._stub.ListAssets(
                asset_pb2.ListAssetsRequest(page_size=LIST_PAGE_SIZE, page_token=page_token)
            )
            for asset in response.assets:
                if asset.HasField("current_version"):
                    yield _to_catalog_version(asset.id, asset.current_version)

            if not response.next_page_token:
                return

            page_token = response.next_page_token


def _to_catalog_version(asset_id: str, version: asset_pb2.AssetVersion) -> CatalogVersion:
    image_keys = (version.source_preview.key,) if version.HasField("source_preview") else ()

    return CatalogVersion(
        asset_id=UUID(asset_id),
        asset_version_id=UUID(version.id),
        version_number=version.number,
        image_keys=image_keys,
    )
