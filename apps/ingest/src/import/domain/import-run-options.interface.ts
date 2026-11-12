import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';

/** `options` of a recorded import run: what shapes the measurement (not where files go). */
export interface ImportRunOptions {
  resolution: TextureResolution;
  packConcurrency: number;
  packInWorkers: boolean;
  uploadConcurrency: number;
  queueSize: number;
  limit: number | null;
  ids: string[] | null;
}
