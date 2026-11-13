import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';
import type { CachedFile } from './cached-file.interface';
import type { CachedPreview } from './cached-preview.interface';

/** `model.json` in a model's cache folder: what `import` needs to pack and describe it. */
export interface CachedModelManifest {
  modelId: string;
  name: string;
  tags: string[];
  categories: string[];
  authors: string[];
  resolution: TextureResolution;
  /** Poly Haven's `files_hash` when fetched; a different value means the model changed. */
  filesHash: string | null;
  /** The `.gltf` file among `files`. */
  gltfPath: string;
  files: CachedFile[];
  /**
   * Uploaded with the model as its source preview. Absent in manifests written before previews
   * were fetched, null when the catalog has no render.
   */
  preview?: CachedPreview | null;
  /** ISO 8601. */
  fetchedAt: string;
}
