import type { UploadPartUrl } from './upload-part-url.interface';

export interface UploadSession {
  assetId: string;
  assetVersionId: string;
  partSizeBytes: number;
  parts: UploadPartUrl[];
}
