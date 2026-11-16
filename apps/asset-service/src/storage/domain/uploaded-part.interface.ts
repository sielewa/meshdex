export interface UploadedPart {
  /** 1-based, as in S3. */
  partNumber: number;
  etag: string;
}
