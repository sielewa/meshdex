import type { Asset } from '../../assets/domain/asset.interface';
import type { PageCursor } from './page-cursor.interface';

export interface AssetPage {
  assets: Asset[];
  /** Position to continue from; null when there are no more pages. */
  next: PageCursor | null;
}
