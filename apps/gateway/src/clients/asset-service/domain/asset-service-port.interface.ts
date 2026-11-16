import type { Asset } from './asset.interface';
import type { AssetPage } from './asset-page.interface';
import type { CompletedPart } from './completed-part.interface';
import type { InitiateUploadCommand } from './initiate-upload-command.interface';
import type { ListAssetsQuery } from './list-assets-query.interface';
import type { OriginalDownloadUrl } from './original-download-url.interface';
import type { UploadPartUrl } from './upload-part-url.interface';
import type { UploadSession } from './upload-session.interface';

export interface AssetServicePort {
  /** Unknown ids are simply missing. At most 100 ids. */
  batchGetAssets(assetIds: readonly string[]): Promise<Asset[]>;
  listAssets(query: ListAssetsQuery): Promise<AssetPage>;
  initiateUpload(command: InitiateUploadCommand): Promise<UploadSession>;
  /** Empty `partNumbers` re-signs every part. */
  getUploadPartUrls(assetVersionId: string, partNumbers: number[]): Promise<UploadPartUrl[]>;
  completeUpload(assetVersionId: string, parts: CompletedPart[]): Promise<Asset>;
  abortUpload(assetVersionId: string): Promise<void>;
  /** Versions without a fully stored original are missing. At most 100 ids. */
  getOriginalDownloadUrls(versionIds: readonly string[]): Promise<OriginalDownloadUrl[]>;
}
