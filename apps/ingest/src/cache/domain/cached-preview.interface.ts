import type { CachedFile } from './cached-file.interface';

export interface CachedPreview extends CachedFile {
  contentType: string;
  /** Where it was downloaded from; the URL carries the render's version. */
  sourceUrl: string;
}
