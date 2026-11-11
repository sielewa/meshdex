import type { AssetVersionStatus } from './asset-version-status.enum';

/** What the upload flow needs to know about a version; `uploadId` never leaves the service. */
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
}
