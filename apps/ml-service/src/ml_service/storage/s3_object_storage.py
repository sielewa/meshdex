"""Reads objects from S3 (SeaweedFS locally) through boto3 (ADR 018)."""

from typing import TYPE_CHECKING, Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from ml_service.config import S3Settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class ObjectNotFoundError(Exception):
    pass


class S3ObjectStorage:
    """Picklable: the reindex job sends it to DataLoader worker processes.

    The boto3 client is created on first use in each process and never pickled: boto3 clients
    hold sockets and locks that can't cross a process boundary, and each worker needs its own
    connection pool anyway.
    """

    # Seconds. A preview is tens of kB; a read that takes this long is a stuck connection.
    CONNECT_TIMEOUT = 2
    READ_TIMEOUT = 10

    def __init__(self, settings: S3Settings) -> None:
        self._settings = settings
        self._client: S3Client | None = None

    def get_bytes(self, key: str) -> bytes:
        try:
            response = self._s3().get_object(Bucket=self._settings.bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise ObjectNotFoundError(key) from error
            raise

        return response["Body"].read()

    def __getstate__(self) -> dict[str, Any]:
        return {"_settings": self._settings, "_client": None}

    def _s3(self) -> "S3Client":
        if self._client is None:
            self._client = self._create_client()

        return self._client

    def _create_client(self) -> "S3Client":
        settings = self._settings
        access_key = settings.access_key_id.get_secret_value() if settings.access_key_id else None
        secret_key = (
            settings.secret_access_key.get_secret_value() if settings.secret_access_key else None
        )
        config = Config(
            connect_timeout=self.CONNECT_TIMEOUT,
            read_timeout=self.READ_TIMEOUT,
            # "standard": retries throttling and transient errors with backoff and jitter.
            retries={"mode": "standard", "max_attempts": 3},
            s3={"addressing_style": "path" if settings.force_path_style else "auto"},
        )

        return boto3.client(
            "s3",
            endpoint_url=str(settings.endpoint) if settings.endpoint else None,
            region_name=settings.region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=config,
        )
