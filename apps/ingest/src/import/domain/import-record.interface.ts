import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';

export interface ImportRecord {
  modelId: string;
  resolution: TextureResolution;
  assetId: string;
  assetVersionId: string;
  sizeBytes: number;
  /** ISO 8601. */
  importedAt: string;
}
