import type { CachedModelManifest } from '../../cache/domain/cached-model-manifest.interface';

/** A model between the pack and upload stages: the whole GLB is in memory. */
export interface PackedModel {
  manifest: CachedModelManifest;
  glb: Uint8Array;
  packMs: number;
}
