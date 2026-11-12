import type { ModelStats } from './model-stats.interface';
import type { StoredObject } from './stored-object.interface';
import type { Thumbnail } from './thumbnail.interface';

export interface ProcessingOutputs {
  optimized: StoredObject;
  thumbnails: Thumbnail[];
  stats: ModelStats;
}
