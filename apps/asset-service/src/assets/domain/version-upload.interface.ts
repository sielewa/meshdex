import type { AssetVersionStatus } from './asset-version-status.enum';
import type { StoredObject } from './stored-object.interface';

/** `uploadId` never leaves the service. */
export interface VersionUpload {
  versionId: string;
  assetId: string;
  number: number;
  status: AssetVersionStatus;
  originalKey: string;
  sizeBytes: number;
  contentType: string;
  uploadId: string | null;
  partSizeBytes: number;
  sourcePreview: StoredObject | null;
}
