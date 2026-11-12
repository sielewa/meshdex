import type { Asset } from './asset.interface';
import type { AssetPage } from './asset-page.interface';
import type { CompletedPart } from './completed-part.interface';
import type { InitiateUploadCommand } from './initiate-upload-command.interface';
import type { ListAssetsQuery } from './list-assets-query.interface';
import type { UploadPartUrl } from './upload-part-url.interface';
import type { UploadSession } from './upload-session.interface';

/**
 * What the gateway needs from asset-service, in domain terms. The gRPC adapter is the
 * only implementation; resolvers and unit tests depend on this interface, so proto types
 * never leak past the adapter. Failures surface as the exceptions in `../exceptions`.
 */
export interface AssetServicePort {
  /** Found assets in request order; ids that don't exist are simply missing. At most 100 ids. */
  batchGetAssets(assetIds: readonly string[]): Promise<Asset[]>;
  listAssets(query: ListAssetsQuery): Promise<AssetPage>;
  initiateUpload(command: InitiateUploadCommand): Promise<UploadSession>;
  /** Empty `partNumbers` re-signs every part. */
  getUploadPartUrls(assetVersionId: string, partNumbers: number[]): Promise<UploadPartUrl[]>;
  completeUpload(assetVersionId: string, parts: CompletedPart[]): Promise<Asset>;
  abortUpload(assetVersionId: string): Promise<void>;
}
