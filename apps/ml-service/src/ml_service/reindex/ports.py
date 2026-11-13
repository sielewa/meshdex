"""What the reindex job needs from the outside world; adapters satisfy these structurally."""

from collections.abc import Iterator, Sequence
from typing import Protocol
from uuid import UUID

from ml_service.clients.asset_service.domain import CatalogVersion
from ml_service.embeddings.domain import VersionEmbeddings


class AssetCatalog(Protocol):
    def list_current_versions(self) -> Iterator[CatalogVersion]: ...


class ImageSource(Protocol):
    """Must be picklable: it is sent to DataLoader worker processes."""

    def get_bytes(self, key: str) -> bytes: ...


class EmbeddingsStore(Protocol):
    def find_embedded_version_ids(self, model: str) -> set[UUID]: ...

    def save_versions(self, model: str, versions: Sequence[VersionEmbeddings]) -> set[UUID]: ...
