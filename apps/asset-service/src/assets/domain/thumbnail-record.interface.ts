/** Stored (flattened) shape of one thumbnail in `asset_versions.thumbnails` (jsonb). */
export interface ThumbnailRecord {
  key: string;
  sizeBytes: number;
  contentType: string;
  width: number;
  height: number;
  view: string;
}
