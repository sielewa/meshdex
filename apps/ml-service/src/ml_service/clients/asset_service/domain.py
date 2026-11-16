from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CatalogVersion:
    asset_id: UUID
    asset_version_id: UUID
    version_number: int
    # Empty when the version has no image yet.
    image_keys: tuple[str, ...]
