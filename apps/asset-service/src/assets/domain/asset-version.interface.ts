import type { AssetVersionStatus } from './asset-version-status.enum';
import type { ModelStats } from './model-stats.interface';
import type { StoredObject } from './stored-object.interface';
import type { Thumbnail } from './thumbnail.interface';

/** Times are epoch milliseconds inside the service (ADR 003). */
export interface AssetVersion {
  id: string;
  assetId: string;
  number: number;
  status: AssetVersionStatus;
  original: StoredObject;
  optimized: StoredObject | null;
  thumbnails: Thumbnail[];
  stats: ModelStats | null;
  failureReason: string | null;
  createdAt: number;
  processedAt: number | null;
}
