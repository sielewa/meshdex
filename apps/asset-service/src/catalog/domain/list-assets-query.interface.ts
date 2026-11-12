import type { AssetVersionStatus } from '../../assets/domain/asset-version-status.enum';
import type { PageCursor } from './page-cursor.interface';

export interface ListAssetsQuery {
  pageSize: number;
  /** Position after which the page starts; null for the first page. */
  after: PageCursor | null;
  statuses: AssetVersionStatus[];
  tag: string;
}
