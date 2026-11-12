export interface NewVersionUpload {
  id: string;
  assetId: string;
  number: number;
  originalKey: string;
  originalFileName: string;
  sizeBytes: number;
  contentType: string;
  uploadId: string;
  partSizeBytes: number;
  createdAt: number;
}
