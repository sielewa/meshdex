import type { CompletedPart } from './completed-part.interface';
import type { InitiateUploadCommand } from './initiate-upload-command.interface';
import type { UploadPartUrl } from './upload-part-url.interface';
import type { UploadSession } from './upload-session.interface';

/**
 * The upload calls `import` needs from asset-service, in domain terms. The gRPC adapter is
 * the only implementation; unit tests use a fake. Failures surface as
 * `AssetServiceRequestException`.
 */
export interface AssetServicePort {
  initiateUpload(command: InitiateUploadCommand): Promise<UploadSession>;
  /** Empty `partNumbers` re-signs every part. */
  getUploadPartUrls(assetVersionId: string, partNumbers: number[]): Promise<UploadPartUrl[]>;
  completeUpload(assetVersionId: string, parts: CompletedPart[]): Promise<void>;
  abortUpload(assetVersionId: string): Promise<void>;
}
