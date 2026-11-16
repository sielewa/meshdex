export interface SearchHit {
  assetId: string;
  /** Cosine similarity. */
  score: number;
}
