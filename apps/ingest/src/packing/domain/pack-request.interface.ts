import type { CachedModelManifest } from '../../cache/domain/cached-model-manifest.interface';

/** Main thread → pack worker. */
export interface PackRequest {
  manifest: CachedModelManifest;
}
