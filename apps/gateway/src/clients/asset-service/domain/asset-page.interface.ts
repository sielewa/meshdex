import type { Asset } from './asset.interface';

export interface AssetPage {
  assets: Asset[];
  nextPageToken: string | null;
}
