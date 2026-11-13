import type { Readable } from 'node:stream';
import type { ModelFileSet } from './model-file-set.interface';
import type { PolyhavenModel } from './polyhaven-model.interface';
import type { TextureResolution } from './texture-resolution.type';

/** What ingest needs from Poly Haven. Throws `PolyhavenRequestException`. */
export interface PolyhavenPort {
  /** Every model in the catalog. */
  listModels(signal: AbortSignal): Promise<PolyhavenModel[]>;

  /** The model's glTF files at `resolution`, or `null` when it has none at that resolution. */
  findGltfFiles(
    modelId: string,
    resolution: TextureResolution,
    signal: AbortSignal,
  ): Promise<ModelFileSet | null>;

  /** Body of a file download as a stream; nothing is buffered. */
  download(url: string, signal: AbortSignal): Promise<Readable>;

  /** Like `download`, for a model's preview image; fails unless the response is WebP. */
  downloadPreview(url: string, signal: AbortSignal): Promise<Readable>;
}
