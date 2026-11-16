import type { AssetStatus } from './asset-status.enum';

export interface ListAssetsQuery {
  pageSize: number;
  pageToken: string | null;
  /** Empty means all statuses. */
  statuses: AssetStatus[];
  /** `null` means any tag. */
  tag: string | null;
}
