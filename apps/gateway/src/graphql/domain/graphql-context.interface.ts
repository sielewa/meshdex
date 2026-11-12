import type DataLoader from 'dataloader';
import type { Request } from 'express';
import type { Asset } from '../../clients/asset-service/domain/asset.interface';
import type { OriginalDownloadUrl } from '../../clients/asset-service/domain/original-download-url.interface';

/** Built once per GraphQL request (`GraphqlOptionsFactory`), so loaders never share a cache between users. */
export interface GraphqlContext {
  req: Request;
  /** Asset by id, `null` when it doesn't exist; batches into BatchGetAssets. */
  assetLoader: DataLoader<string, Asset | null>;
  /** Download URL by version id, `null` without a stored original; batches into GetOriginalDownloadUrls. */
  originalDownloadUrlLoader: DataLoader<string, OriginalDownloadUrl | null>;
}
