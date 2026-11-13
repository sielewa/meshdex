"""What ml-service needs from asset-service, in its own terms (no generated proto types)."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CatalogVersion:
    """The current version of one asset and the images that show it."""

    asset_id: UUID
    asset_version_id: UUID
    version_number: int
    # Object storage keys; empty when the version has no image yet.
    image_keys: tuple[str, ...]
