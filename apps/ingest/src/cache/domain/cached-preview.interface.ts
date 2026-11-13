import type { CachedFile } from './cached-file.interface';

/** A model's preview image in its cache folder (ADR 017). */
export interface CachedPreview extends CachedFile {
  contentType: string;
  /** Where it was downloaded from; the URL carries the render's version. */
  sourceUrl: string;
}
