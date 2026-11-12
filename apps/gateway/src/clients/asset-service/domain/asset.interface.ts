import type { AssetStatus } from './asset-status.enum';
import type { AssetVersion } from './asset-version.interface';

export interface Asset {
  id: string;
  title: string;
  tags: string[];
  /** Status of `currentVersion`, lifted so lists don't need to select the version. */
  status: AssetStatus;
  currentVersion: AssetVersion;
  createdAt: number;
  updatedAt: number;
}
