import type { AssetVersionStatus } from '../../assets/domain/asset-version-status.enum';

export interface AssetListFilter {
  statuses: AssetVersionStatus[];
  tag: string | null;
}
