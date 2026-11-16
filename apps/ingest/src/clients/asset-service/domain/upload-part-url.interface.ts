export interface UploadPartUrl {
  partNumber: number;
  /** Presigned PUT URL: a credential, never logged. */
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}
