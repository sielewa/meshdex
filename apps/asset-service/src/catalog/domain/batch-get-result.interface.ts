import type { Asset } from '../../assets/domain/asset.interface';

export interface BatchGetResult {
  assets: Asset[];
  notFoundIds: string[];
}
