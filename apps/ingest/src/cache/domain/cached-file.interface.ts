/** A file in a model's cache folder and the size and MD5 it must have. */
export interface CachedFile {
  /** Relative to the model's folder. */
  path: string;
  sizeBytes: number;
  md5: string;
}
