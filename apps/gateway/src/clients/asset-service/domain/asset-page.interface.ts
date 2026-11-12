import type { Asset } from './asset.interface';

export interface AssetPage {
  assets: Asset[];
  /** Opaque cursor for the next page; `null` on the last page. */
  nextPageToken: string | null;
}
