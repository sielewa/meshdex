export interface CachedFile {
  /** Relative to the model's folder. */
  path: string;
  sizeBytes: number;
  md5: string;
}
