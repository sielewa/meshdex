import type { Asset } from '../../assets/domain/asset.interface';

export interface BatchGetResult {
  /** Found assets in the order they were asked for. */
  assets: Asset[];
  notFoundIds: string[];
}
