import type { AssetVersion } from './asset-version.interface';

/** Times are epoch milliseconds inside the service (ADR 003). */
export interface Asset {
  id: string;
  title: string;
  tags: string[];
  currentVersion: AssetVersion;
  createdAt: number;
  updatedAt: number;
}
