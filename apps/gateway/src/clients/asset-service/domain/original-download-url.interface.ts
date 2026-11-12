/** Short-lived presigned GET URL of a version's original upload (ADR 010). */
export interface OriginalDownloadUrl {
  versionId: string;
  url: string;
  /** Epoch milliseconds (ADR 003). */
  expiresAt: number;
}
