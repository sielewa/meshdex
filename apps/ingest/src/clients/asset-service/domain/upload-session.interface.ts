import type { UploadPartUrl } from './upload-part-url.interface';

export interface UploadSession {
  assetId: string;
  assetVersionId: string;
  /** Every part except the last has exactly this size. */
  partSizeBytes: number;
  parts: UploadPartUrl[];
  /** Presigned PUT for the declared source preview; null when none was declared. */
  sourcePreviewUploadUrl: string | null;
}
