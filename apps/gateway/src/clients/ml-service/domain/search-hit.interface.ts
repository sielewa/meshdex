export interface SearchHit {
  assetId: string;
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  score: number;
}
