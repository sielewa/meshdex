"""S3ObjectStorage with botocore's Stubber: no network, the requests and responses are checked."""

import io
import pickle

import pytest
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from botocore.stub import Stubber
from pydantic import HttpUrl, SecretStr

from ml_service.config import S3Settings
from ml_service.storage.s3_object_storage import ObjectNotFoundError, S3ObjectStorage


def _settings(*, force_path_style: bool = True) -> S3Settings:
    # Every field explicit, so a developer's .env can't change what is tested.
    return S3Settings(
        endpoint=HttpUrl("http://localhost:8333"),
        region="us-east-1",
        bucket="meshdex",
        access_key_id=SecretStr("test-key"),
        secret_access_key=SecretStr("test-secret"),
        force_path_style=force_path_style,
    )


def _body(data: bytes) -> StreamingBody:
    return StreamingBody(io.BytesIO(data), len(data))


def test_reads_an_objects_bytes_from_the_configured_bucket() -> None:
    storage = S3ObjectStorage(_settings())
    with Stubber(storage._s3()) as stub:
        stub.add_response(
            "get_object",
            {"Body": _body(b"webp bytes")},
            {"Bucket": "meshdex", "Key": "public/previews/chair.webp"},
        )

        assert storage.get_bytes("public/previews/chair.webp") == b"webp bytes"


def test_a_missing_key_raises_object_not_found() -> None:
    storage = S3ObjectStorage(_settings())
    with Stubber(storage._s3()) as stub:
        stub.add_client_error("get_object", service_error_code="NoSuchKey", http_status_code=404)

        with pytest.raises(ObjectNotFoundError, match=r"gone\.webp"):
            storage.get_bytes("gone.webp")


def test_other_storage_errors_propagate() -> None:
    storage = S3ObjectStorage(_settings())
    with Stubber(storage._s3()) as stub:
        stub.add_client_error("get_object", service_error_code="AccessDenied", http_status_code=403)

        with pytest.raises(ClientError, match="AccessDenied"):
            storage.get_bytes("private.webp")


@pytest.mark.parametrize(("force_path_style", "style"), [(True, "path"), (False, "auto")])
def test_addressing_style_follows_the_settings(force_path_style: bool, style: str) -> None:
    """SeaweedFS needs path-style URLs (http://host/bucket/key); AWS picks its own."""
    config = S3ObjectStorage(_settings(force_path_style=force_path_style))._s3().meta.config

    # Config sets its attributes dynamically; botocore's stubs don't declare `s3`.
    options: dict[str, str] | None = getattr(config, "s3", None)

    assert options is not None
    assert options["addressing_style"] == style


def test_pickles_without_its_client_for_dataloader_workers() -> None:
    storage = S3ObjectStorage(_settings())
    used_client = storage._s3()

    restored = pickle.loads(pickle.dumps(storage))

    assert restored._client is None
    assert restored._s3() is not used_client
