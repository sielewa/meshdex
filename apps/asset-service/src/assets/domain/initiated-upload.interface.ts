import type { PresignedPart } from './presigned-part.interface';

export interface InitiatedUpload {
  assetId: string;
  versionId: string;
  partSizeBytes: number;
  parts: PresignedPart[];
}
