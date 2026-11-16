import type DataLoader from 'dataloader';
import type { Request } from 'express';
import type { Asset } from '../../clients/asset-service/domain/asset.interface';
import type { OriginalDownloadUrl } from '../../clients/asset-service/domain/original-download-url.interface';

/** One per request, so loaders never share a cache between users. */
export interface GraphqlContext {
  req: Request;
  assetLoader: DataLoader<string, Asset | null>;
  originalDownloadUrlLoader: DataLoader<string, OriginalDownloadUrl | null>;
}
