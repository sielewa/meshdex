export interface ModelFailure {
  modelId: string;
  /** Error message; never contains presigned URLs. */
  reason: string;
}
