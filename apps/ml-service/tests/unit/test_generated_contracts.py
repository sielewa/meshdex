"""Smoke test of the generated gRPC code: it imports under ml_service.gen and keeps wire names.

The import rewrite in scripts/generate_proto.py moves the Python modules, but must not change the
proto package (`meshdex.ml.v1`), which is part of every gRPC method path on the wire.
"""

from ml_service.gen.meshdex.asset.v1 import asset_pb2, asset_pb2_grpc
from ml_service.gen.meshdex.ml.v1 import ml_pb2, ml_pb2_grpc


def test_ml_contract_keeps_its_proto_package() -> None:
    service = ml_pb2.DESCRIPTOR.services_by_name["EmbeddingService"]

    assert service.full_name == "meshdex.ml.v1.EmbeddingService"
    assert issubclass(ml_pb2_grpc.EmbeddingServiceServicer, object)


def test_asset_contract_is_available_for_the_client() -> None:
    request = asset_pb2.ListAssetsRequest(page_size=100)

    assert asset_pb2.DESCRIPTOR.package == "meshdex.asset.v1"
    assert request.page_size == 100
    assert hasattr(asset_pb2_grpc, "AssetServiceStub")
