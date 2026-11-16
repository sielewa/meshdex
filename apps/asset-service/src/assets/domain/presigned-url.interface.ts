export interface PresignedUrl {
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}
