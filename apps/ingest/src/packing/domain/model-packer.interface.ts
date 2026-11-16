import type { CachedModelManifest } from '../../cache/domain/cached-model-manifest.interface';

export interface ModelPacker {
  pack(manifest: CachedModelManifest): Promise<Uint8Array>;
}
