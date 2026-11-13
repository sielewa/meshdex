import type { AssetStatus } from './asset-status.enum';
import type { ModelStats } from './model-stats.interface';
import type { StoredObject } from './stored-object.interface';
import type { Thumbnail } from './thumbnail.interface';

/** Times are epoch milliseconds (ADR 003); fields that proto leaves empty are `null`. */
export interface AssetVersion {
  id: string;
  assetId: string;
  number: number;
  status: AssetStatus;
  original: StoredObject;
  optimized: StoredObject | null;
  thumbnails: Thumbnail[];
  stats: ModelStats | null;
  failureReason: string | null;
  createdAt: number;
  processedAt: number | null;
  /** Image supplied with the upload (ADR 017). */
  sourcePreview: StoredObject | null;
}
