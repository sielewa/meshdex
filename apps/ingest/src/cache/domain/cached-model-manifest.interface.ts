import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';
import type { CachedFile } from './cached-file.interface';
import type { CachedPreview } from './cached-preview.interface';

export interface CachedModelManifest {
  modelId: string;
  name: string;
  tags: string[];
  categories: string[];
  authors: string[];
  resolution: TextureResolution;
  /** Poly Haven's `files_hash` when fetched; a different value means the model changed. */
  filesHash: string | null;
  gltfPath: string;
  files: CachedFile[];
  /** Absent in manifests written before previews were fetched; null when there is no render. */
  preview?: CachedPreview | null;
  /** ISO 8601. */
  fetchedAt: string;
}
