import type { PresignedPart } from './presigned-part.interface';
import type { PresignedUrl } from './presigned-url.interface';

export interface InitiatedUpload {
  assetId: string;
  versionId: string;
  partSizeBytes: number;
  parts: PresignedPart[];
  sourcePreviewUpload: PresignedUrl | null;
}
