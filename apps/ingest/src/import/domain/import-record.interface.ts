import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';

/** One line of the state file: a model that is already an asset. */
export interface ImportRecord {
  modelId: string;
  resolution: TextureResolution;
  assetId: string;
  assetVersionId: string;
  sizeBytes: number;
  /** ISO 8601. */
  importedAt: string;
}
