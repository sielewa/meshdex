"""Configuration from environment variables (and `.env` locally), validated before any work starts.

One settings class per namespace, like the `registerAs` namespaces of the NestJS services: a command
loads only the namespaces it needs, so `migrate` doesn't require model or storage variables, and a
missing or malformed variable stops the command with a message listing every problem (ADR 007).
"""

from typing import Literal

from pydantic import Field, FilePath, HttpUrl, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Local development reads apps/ml-service/.env (gitignored); in Kubernetes the variables come from
# the service's ConfigMap/Secret and the file doesn't exist. Real environment variables win.
ENV_FILE = ".env"


class DatabaseSettings(BaseSettings):
    """The service's own database (database per service)."""

    # extra="ignore": the .env file holds every namespace, each class reads only its prefix.
    model_config = SettingsConfigDict(env_prefix="DATABASE_", env_file=ENV_FILE, extra="ignore")

    url: PostgresDsn
    pool_max: int = Field(default=10, ge=1)


class AssetServiceSettings(BaseSettings):
    """asset-service, called over gRPC (same variable names as in the gateway and ingest)."""

    model_config = SettingsConfigDict(
        env_prefix="ASSET_SERVICE_", env_file=ENV_FILE, extra="ignore"
    )

    # host:port
    url: str = Field(min_length=1)
    # Deadline of one read call, retries included.
    read_timeout_ms: int = Field(default=2000, ge=1)


class S3Settings(BaseSettings):
    """Object storage: SeaweedFS locally, AWS S3 in the cloud (same names as asset-service)."""

    model_config = SettingsConfigDict(env_prefix="S3_", env_file=ENV_FILE, extra="ignore")

    # Unset in AWS: the SDK then uses the regional endpoint.
    endpoint: HttpUrl | None = None
    region: str = Field(min_length=1)
    bucket: str = Field(min_length=1)
    # Unset in AWS: the SDK then uses the pod's IAM role. SecretStr keeps them out of logs/reprs.
    access_key_id: SecretStr | None = None
    secret_access_key: SecretStr | None = None
    # Path-style URLs (http://host/bucket/key), required by local S3 implementations.
    force_path_style: bool = False


class ClipSettings(BaseSettings):
    """The CLIP model: open_clip architecture + pretrained tag, weights from a local file (ADR 018).

    The tag is required even though the weights come from a file: it selects the image
    preprocessing the weights were trained with and names the model in stored embeddings.
    """

    model_config = SettingsConfigDict(env_prefix="CLIP_", env_file=ENV_FILE, extra="ignore")

    architecture: str = Field(min_length=1)
    pretrained: str = Field(min_length=1)
    # FilePath: must exist, so a missing weights file stops the service at startup.
    checkpoint_path: FilePath
    device: Literal["cpu", "mps", "cuda"] = "cpu"


class LoggingSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LOG_", env_file=ENV_FILE, extra="ignore")

    level: Literal["debug", "info", "warning", "error"] = "info"
    # Human-readable lines for local development; JSON otherwise.
    pretty: bool = False
