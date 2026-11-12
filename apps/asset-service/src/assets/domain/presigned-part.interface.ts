export interface PresignedPart {
  partNumber: number;
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}
