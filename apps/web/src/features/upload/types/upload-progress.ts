export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  completedParts: number;
  partCount: number;
  /** True when parts stored by an earlier, interrupted attempt were reused. */
  resumed: boolean;
}
