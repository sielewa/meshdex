"""One settings class per namespace, so a command loads only what it needs (ADR 007)."""

from typing import Literal

from pydantic import Field, FilePath, HttpUrl, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = ".env"


class DatabaseSettings(BaseSettings):
    # The .env file holds every namespace; each class reads its own prefix.
    model_config = SettingsConfigDict(env_prefix="DATABASE_", env_file=ENV_FILE, extra="ignore")

    url: PostgresDsn
    pool_max: int = Field(default=10, ge=1)


class GrpcServerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GRPC_", env_file=ENV_FILE, extra="ignore")

    url: str = Field(min_length=1)
    # DATABASE_POOL_MAX must cover them (ADR 019).
    max_workers: int = Field(default=8, ge=1)
    # Beyond this, RESOURCE_EXHAUSTED instead of queueing.
    max_concurrent_rpcs: int = Field(default=32, ge=1)
    shutdown_grace_s: float = Field(default=10, gt=0)


class AssetServiceSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ASSET_SERVICE_", env_file=ENV_FILE, extra="ignore"
    )

    url: str = Field(min_length=1)
    # Retries included.
    read_timeout_ms: int = Field(default=2000, ge=1)


class S3Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="S3_", env_file=ENV_FILE, extra="ignore")

    # Unset in AWS: regional endpoint and the pod's IAM role.
    endpoint: HttpUrl | None = None
    region: str = Field(min_length=1)
    bucket: str = Field(min_length=1)
    access_key_id: SecretStr | None = None
    secret_access_key: SecretStr | None = None
    # Required by local S3 implementations.
    force_path_style: bool = False


class ClipSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CLIP_", env_file=ENV_FILE, extra="ignore")

    architecture: str = Field(min_length=1)
    # Required with a local weights file too: it selects the training preprocessing.
    pretrained: str = Field(min_length=1)
    checkpoint_path: FilePath
    device: Literal["cpu", "mps", "cuda"] = "cpu"


class LoggingSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LOG_", env_file=ENV_FILE, extra="ignore")

    level: Literal["debug", "info", "warning", "error"] = "info"
    pretty: bool = False
