import type { CachedModelManifest } from '../../cache/domain/cached-model-manifest.interface';

/** Turns a cached model into GLB bytes, on the main thread or in a worker thread. */
export interface ModelPacker {
  pack(manifest: CachedModelManifest): Promise<Uint8Array>;
}
