import type { AssetStatus } from './asset-status.enum';
import type { ModelStats } from './model-stats.interface';
import type { StoredObject } from './stored-object.interface';
import type { Thumbnail } from './thumbnail.interface';

/** Epoch milliseconds (ADR 003); empty proto fields are `null`. */
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
  sourcePreview: StoredObject | null;
}
