export interface OriginalDownloadUrl {
  versionId: string;
  url: string;
  /** Epoch milliseconds (ADR 003). */
  expiresAt: number;
}
