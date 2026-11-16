import type { CachedModelManifest } from '../../cache/domain/cached-model-manifest.interface';

export interface PackRequest {
  manifest: CachedModelManifest;
}
